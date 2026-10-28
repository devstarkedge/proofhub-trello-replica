import jwt from 'jsonwebtoken';
import { mediaResponse } from '../services/attachmentDelivery.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import Workspace from '../models/Workspace.js';
import { LRUCache } from 'lru-cache';
import config from '../config/index.js';
import { ensureDefaultWorkspace } from '../modules/permissions/workspaceService.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import logger from '../utils/logger.js';
import { guardOfflineMutation } from './offlineMutation.js';
import { rateLimiter } from './rateLimiter.js';
const authenticatedBudget = rateLimiter({ ...config.rateLimit.global, keyFn: req => String(req.user._id || req.user.id), allowReadFallback: true });

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
// Membership and identity entries use explicit workspace/user keys. Existing
// user-only invalidators evict that user's entries across all workspaces.
const membershipCache = new LRUCache({
  max: config.authCache.maxSize,
  ttl: config.authCache.ttlMs,
});

// Caching is optional and production-only. Local requests always read MongoDB.
// Keep the existing bounded TTL cache; it is not a Redis session store.
const cacheKey = (workspaceId, kind, userId) => workspaceId ? `ws:${workspaceId}:${kind}:user:${userId}` : null;
function readCache(cache, key) {
  if (!config.authCache.enabled || !key) return undefined;
  try { return cache.get(key); } catch { return undefined; }
}
function writeCache(cache, key, value) {
  if (!config.authCache.enabled || !key) return;
  try { cache.set(key, value); } catch { /* Cache failures leave MongoDB authoritative. */ }
}

async function getMembership(userId, workspaceId) {
  // Authorization state must be current across all server instances.
  const [membership, workspace] = await Promise.all([
    WorkspaceMembership.findOne({ user: userId, workspace: workspaceId, status: 'active' }).lean(),
    Workspace.findById(workspaceId).select('isActive status').lean()
  ]);
  return workspace?.isActive && !['suspended', 'archived'].includes(workspace.status) ? membership : null;
}

/**
 * Invalidate a user's auth cache entry.
 * Call this when user data changes (profile update, role change, deactivation).
 */
export const invalidateAuthCache = (userId) => {
  if (userId) {
    const suffix = `:user:${userId}`;
    for (const cache of [authCache, membershipCache]) {
      for (const key of cache.keys()) if (key.endsWith(suffix)) cache.delete(key);
    }
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
  if (req.user && req.workspaceId) return workspaceContext.run({ workspaceId: req.workspaceId, actorId: req.user.id || req.user._id }, next);
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
      req.authExpiresAt = Number.isFinite(decoded.exp) ? decoded.exp * 1000 : undefined;
      const userId = decoded.id;
      const userCacheKey = cacheKey(req.headers['x-workspace-id'], 'identity', userId);

      // Check LRU cache first
      let userObj = readCache(authCache, userCacheKey);

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
        writeCache(authCache, userCacheKey, userObj);
      }

      // Normalize user shape for controller compatibility.
      // Many controllers access req.user.id (not _id), while lean() returns _id.
      if (!userObj.id && userObj._id) {
        userObj = {
          ...userObj,
          id: userObj._id.toString(),
        };
        writeCache(authCache, userCacheKey, userObj);
      }

      // Revocation state is fresh on every request, including other instances.
      const sessionAccount = await User.findById(userId).select('tokenVersion forcePasswordChange isActive').lean();
      if (!sessionAccount?.isActive || decoded.type !== 'access' || !Number.isInteger(decoded.tokenVersion) || decoded.tokenVersion !== (sessionAccount.tokenVersion || 0)) {
          invalidateAuthCache(userId);
          return res.status(401).json({
            success: false,
            message: 'Session invalidated. Please log in again.'
          });
      }
      userObj = { ...userObj, ...sessionAccount };
      const passwordRoute = String(req.originalUrl || req.url || '').split('?')[0];
      const passwordRecoveryRoutes = ['/api/auth/me', '/api/auth/verify', '/api/auth/updatepassword', '/api/users/profile', '/api/users/settings', '/api/admin/settings'];
      if (userObj.forcePasswordChange && !passwordRecoveryRoutes.includes(passwordRoute)) {
        return res.status(403).json({ success: false, code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your password to continue' });
      }

      if (!userObj.isActive) {
        // Evict deactivated users from cache
        if (userCacheKey) authCache.delete(userCacheKey);
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

      const membership = requestedWorkspaceId ? await getMembership(userId, requestedWorkspaceId) : null;

      if (!membership) {
        // A platform-level Super Admin account can legitimately have no
        // usable workspace at all (none, or a stale x-workspace-id/
        // lastActiveWorkspace left over after a Super Admin Dashboard
        // action removed one — the browser's localStorage.workspaceId is
        // never touched by that flow, see SuperAdminRouteGuard). Without
        // this, a hard refresh 403s /api/auth/verify, and AuthContext's
        // restoreSession() treats ANY verify failure as "log the user
        // out" — so a Super Admin with no workspace would be logged out
        // on every page reload. This grants no permissions (role/workspace
        // stay null, so every workspace-scoped authorization check still
        // correctly denies); it only lets identity resolve. Deliberately
        // NOT wrapped in workspaceContext.run() below — any workspace-
        // scoped query a request like this happens to reach still throws
        // loudly (the plugin's existing fail-closed design), rather than
        // silently running against a stale/deleted workspaceId.
        if (userObj.isSuperAdmin === true) {
          req.user = {
            ...userObj,
            role: null,
            roleId: null,
            department: [],
            team: null,
            accessType: null,
            allowedProjects: [],
            workspaceId: null
          };
          req.workspaceId = null;
          return next();
        }

        // Diagnostic trail for "why did this specific request get rejected"
        // — getMembership() always queries fresh (a negative lookup is
        // never cached, see its own comment above), so this rejection
        // genuinely reflects "no active WorkspaceMembership + active
        // Workspace" for this exact (userId, requestedWorkspaceId) pair at
        // this exact moment. The most common legitimate cause is simply
        // the browser's active workspace (x-workspace-id) pointing at a
        // different workspace than the one a later request used — e.g. the
        // user switched workspaces between the two calls — not a bug by
        // itself, but logged here so that's provable instead of assumed.
        logger.warn('[Auth] Rejected: no active membership for requested workspace', {
          userId, requestedWorkspaceId,
          workspaceIdSource: req.headers['x-workspace-id'] ? 'x-workspace-id header'
            : userObj.lastActiveWorkspace ? 'user.lastActiveWorkspace' : 'ensureDefaultWorkspace() fallback',
          xWorkspaceIdHeader: req.headers['x-workspace-id'] || null,
          lastActiveWorkspace: userObj.lastActiveWorkspace?.toString() || null,
          path: req.originalUrl, method: req.method
        });
        return res.status(requestedWorkspaceId ? 403 : 401).json({
          success: false,
          message: requestedWorkspaceId ? 'Not a member of this workspace' : 'No workspace context available'
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
        restriction: membership.restriction,
        kind: membership.kind,
        workspaceId: requestedWorkspaceId
      };
      req.workspaceId = requestedWorkspaceId;
      req.workspaceMembership = membership;

      workspaceContext.run({ workspaceId: requestedWorkspaceId, actorId: req.user.id || req.user._id }, () => {
        mediaResponse(req, res, () => authenticatedBudget(req, res, () => guardOfflineMutation(req, res, next).catch(next)).catch(next));
      });
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
    const normalizedUserRole = String(req.user.role || '').toLowerCase();
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
        
        if (userRoleDoc?.isActive && userRoleDoc.permissions?.canManageSystem) {
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
