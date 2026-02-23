import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Role from '../models/Role.js';

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
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Query DB directly
      const user = await User.findById(decoded.id).select('-password').populate('roleId');

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }

      req.user = user.toObject ? user.toObject() : user;

      if (!req.user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'User account is deactivated'
        });
      }

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