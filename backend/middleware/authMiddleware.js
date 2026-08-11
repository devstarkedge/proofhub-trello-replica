import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Role from '../models/Role.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import Workspace from '../models/Workspace.js';
import { LRUCache } from 'lru-cache';
import config from '../config/index.js';
import { ensureDefaultWorkspace } from '../modules/permissions/workspaceService.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';

// ─── Auth Cache ─────────────────────────────────────────────────────────────
// In-memory LRU cache for authenticated user lookups.
// Eliminates 2+ DB queries per request for repeat calls within TTL window.
// Cache is per-process — safe for stateless horizontal scaling (each instance
// has its own cache; worst case is a cache miss on a new instance).
const authCache = new LRUCache({
  max: config.authCache.maxSize,
  ttl: config.authCache.ttlMs,
});

// ─── Membership Cache ───────────────────────────────────────────────────────
// Split from authCache above rather than a composite `${userId}:${workspaceId}`
// key: keyed by userId ALONE, holding a small { [workspaceId]: membership }
// map as its value. This means invalidateAuthCache(userId) — which already
// has ~15 existing call sites that only ever pass a bare userId — busts
// every workspace's cached membership for that user in one call, with zero
// changes needed at any of those call sites.
const membershipCache = new LRUCache({
  max: config.authCache.maxSize,
  ttl: config.authCache.ttlMs,
});

async function getMembership(userId, workspaceId) {
  const userKey = userId.toString();
  const wsKey = workspaceId.toString();
  let perUser = membershipCache.get(userKey);
  if (!perUser?.[wsKey]) {
    const doc = await WorkspaceMembership.findOne({
      user: userId,
      workspace: workspaceId,
      status: 'active'
    }).lean();
    if (!doc) return null;
    // Deactivating a workspace (workspaceController.deactivateWorkspace)
    // leaves membership rows in place — reject here so a stale header or
    // lastActiveWorkspace can't keep using an owner-deactivated workspace.
    const workspaceDoc = await Workspace.findById(workspaceId).select('isActive').lean();
    if (!workspaceDoc || !workspaceDoc.isActive) return null;
    perUser = { ...perUser, [wsKey]: doc };
    membershipCache.set(userKey, perUser);
  }
  return perUser[wsKey];
}

/**
 * Invalidate a user's auth cache entry.
 * Call this when user data changes (profile update, role change, deactivation).
 */
export const invalidateAuthCache = (userId) => {
  if (userId) {
    authCache.delete(userId.toString());
    membershipCache.delete(userId.toString());
  }
};

/**
 * Clear the entire auth cache.
 * Call this for bulk operations (role deletions, mass deactivations).
 */
export const clearAuthCache = () => {
  authCache.clear();
  membershipCache.clear();
};

export const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check if token exists
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    try {
      // Verify token (CPU-only, no DB call)
      const decoded = jwt.verify(token, config.jwt.secret);
      const userId = decoded.id;

      // Check LRU cache first
      let userObj = authCache.get(userId);

      if (!userObj) {
        // Cache miss — query DB with lean() + select() for minimal overhead.
        // `.populate('roleId')` issues its own internal query against Role
        // (workspace-scoped), and we don't know the caller's workspace yet
        // at this point in the function — that's resolved further down.
        // Without runUnscoped() here, every cache miss for a user whose
        // roleId is set throws "no active workspace context" (caught below
        // and misreported as a 401), locking that user out until the cache
        // happens to stay warm. Confirmed empirically, not hypothetical.
        const user = await workspaceContext.runUnscoped(async () => await User.findById(userId)
          .select('-password')
          .populate('roleId')
          .lean());

        if (!user) {
          return res.status(401).json({
            success: false,
            message: 'User not found'
          });
        }

        userObj = user;
        // Store in cache
        authCache.set(userId, userObj);
      }

      // Normalize user shape for controller compatibility.
      // Many controllers access req.user.id (not _id), while lean() returns _id.
      if (!userObj.id && userObj._id) {
        userObj = {
          ...userObj,
          id: userObj._id.toString(),
        };
        authCache.set(userId, userObj);
      }

      if (!userObj.isActive) {
        // Evict deactivated users from cache
        authCache.delete(userId);
        return res.status(401).json({
          success: false,
          message: 'User account is deactivated'
        });
      }

      // ── Resolve active workspace & overlay per-workspace role/access ──
      // Header first (the frontend's active workspace selection), then the
      // user's last-active workspace, then the single default workspace —
      // so an existing single-workspace user's requests need no header at
      // all and behave exactly as before this migration.
      const requestedWorkspaceId =
        req.headers['x-workspace-id'] ||
        userObj.lastActiveWorkspace?.toString() ||
        (await ensureDefaultWorkspace())?.toString();

      if (!requestedWorkspaceId) {
        return res.status(401).json({
          success: false,
          message: 'No workspace context available'
        });
      }

      const membership = await getMembership(userId, requestedWorkspaceId);
      if (!membership) {
        return res.status(403).json({
          success: false,
          message: 'Not a member of this workspace'
        });
      }

      // A new object per request — never mutate/write back the shared
      // cached base user. Unlike the `.id` normalization above (safe to
      // cache because it's workspace-invariant), these five fields vary by
      // active workspace, so caching them onto the shared userObj entry
      // would leak workspace A's role into workspace B's request the next
      // time that same cache entry is read.
      req.user = {
        ...userObj,
        role: membership.role,
        roleId: membership.roleId,
        department: membership.department,
        team: membership.team,
        accessType: membership.accessType,
        allowedProjects: membership.allowedProjects,
        workspaceId: requestedWorkspaceId
      };
      req.workspaceId = requestedWorkspaceId;

      workspaceContext.run({ workspaceId: requestedWorkspaceId }, next);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Token is invalid or expired'
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

// Role-based authorization middleware
// Supports both predefined roles and custom roles
export const authorize = (...roles) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    // Normalize roles to lowercase for comparison
    const normalizedUserRole = req.user.role.toLowerCase();
    const normalizedRoles = roles.map(role => role.toLowerCase());

    // Check if user's role is in the allowed roles list
    if (normalizedRoles.includes(normalizedUserRole)) {
      return next();
    }

    // For custom roles, check if they have equivalent permissions
    // Admin check - admin always has full access
    if (normalizedUserRole === 'admin') {
      return next();
    }

    // If the route requires 'admin' specifically and user is not admin
    if (normalizedRoles.length === 1 && normalizedRoles[0] === 'admin') {
      // Check if custom role has admin-level permissions (canManageSystem)
      try {
        let userRoleDoc;
        const roleId = req.user.roleId?._id || req.user.roleId;
        if (roleId) {
          userRoleDoc = await Role.findById(roleId);
        } else {
          userRoleDoc = await Role.findResolvable(normalizedUserRole, req.user.workspaceId);
        }
        
        if (userRoleDoc && userRoleDoc.permissions && userRoleDoc.permissions.canManageSystem) {
          return next();
        }
      } catch (error) {
        console.error('Error checking custom admin role:', error);
      }
      
      return res.status(403).json({
        success: false,
        message: `User role '${req.user.role}' is not authorized to access this route`
      });
    }

    // For custom roles not in the predefined list, 
    // check if the role exists and is active
    try {
      let userRoleDoc;
      const roleId = req.user.roleId?._id || req.user.roleId;
      if (roleId) {
        userRoleDoc = await Role.findById(roleId);
      } else {
        userRoleDoc = await Role.findResolvable(normalizedUserRole, req.user.workspaceId);
      }
      if (userRoleDoc) {
        // Custom role exists and is active - allow access based on route requirements
        // More granular permission checks should be done using checkPermission middleware
        return next();
      }
    } catch (error) {
      console.error('Error checking custom role:', error);
    }

    return res.status(403).json({
      success: false,
      message: `User role '${req.user.role}' is not authorized to access this route`
    });
  };
};

// Check if user is verified
export const requireVerified = (req, res, next) => {
  if (!req.user.isVerified) {
    return res.status(403).json({
      success: false,
      message: 'Please verify your account to access this resource'
    });
  }
  next();
};