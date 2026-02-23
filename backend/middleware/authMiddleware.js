import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Role from '../models/Role.js';
import { LRUCache } from 'lru-cache';
import config from '../config/index.js';

// ─── Auth Cache ─────────────────────────────────────────────────────────────
// In-memory LRU cache for authenticated user lookups.
// Eliminates 2+ DB queries per request for repeat calls within TTL window.
// Cache is per-process — safe for stateless horizontal scaling (each instance
// has its own cache; worst case is a cache miss on a new instance).
const authCache = new LRUCache({
  max: config.authCache.maxSize,
  ttl: config.authCache.ttlMs,
});

/**
 * Invalidate a user's auth cache entry.
 * Call this when user data changes (profile update, role change, deactivation).
 */
export const invalidateAuthCache = (userId) => {
  if (userId) {
    authCache.delete(userId.toString());
  }
};

/**
 * Clear the entire auth cache.
 * Call this for bulk operations (role deletions, mass deactivations).
 */
export const clearAuthCache = () => {
  authCache.clear();
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
        // Cache miss — query DB with lean() + select() for minimal overhead
        const user = await User.findById(userId)
          .select('-password')
          .populate('roleId')
          .lean();

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

      req.user = userObj;
      next();
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
          userRoleDoc = await Role.findOne({ slug: normalizedUserRole, isActive: true });
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
        userRoleDoc = await Role.findOne({ slug: normalizedUserRole, isActive: true });
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