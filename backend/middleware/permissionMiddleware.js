import Role from '../models/Role.js';

/**
 * Permission-based Access Control Middleware
 * Checks if a user has specific permissions based on their role
 */

/**
 * Check if user has a specific permission
 * @param {string} permission - The permission key to check
 * @returns {Function} Express middleware
 */
export const checkPermission = (permission) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    try {
      const userRole = req.user.role.toLowerCase();
      
      // Admin always has all permissions
      if (userRole === 'admin') {
        return next();
      }
      
      // Find the role in database
      let role = await Role.findOne({ slug: userRole });
      
      // If role doesn't exist in DB, use default permissions
      if (!role) {
        const defaultPermissions = Role.getDefaultPermissions(userRole);
        if (defaultPermissions[permission]) {
          return next();
        }
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to perform this action'
        });
      }
      
      // Check if role is active
      if (!role.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Your role has been deactivated. Please contact an administrator.'
        });
      }
      
      // Check the specific permission
      if (role.permissions && role.permissions[permission]) {
        return next();
      }
      
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action'
      });
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking permissions'
      });
    }
  };
};

/**
 * Check if user has any of the specified permissions
 * @param {...string} permissions - The permission keys to check
 * @returns {Function} Express middleware
 */
export const checkAnyPermission = (...permissions) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    try {
      const userRole = req.user.role.toLowerCase();
      
      // Admin always has all permissions
      if (userRole === 'admin') {
        return next();
      }
      
      // Find the role in database
      let role = await Role.findOne({ slug: userRole });
      let rolePermissions;
      
      if (!role) {
        rolePermissions = Role.getDefaultPermissions(userRole);
      } else {
        if (!role.isActive) {
          return res.status(403).json({
            success: false,
            message: 'Your role has been deactivated. Please contact an administrator.'
          });
        }
        rolePermissions = role.permissions || {};
      }
      
      // Check if user has any of the required permissions
      const hasPermission = permissions.some(perm => rolePermissions[perm]);
      
      if (hasPermission) {
        return next();
      }
      
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action'
      });
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking permissions'
      });
    }
  };
};

/**
 * Check if user has all of the specified permissions
 * @param {...string} permissions - The permission keys to check
 * @returns {Function} Express middleware
 */
export const checkAllPermissions = (...permissions) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    try {
      const userRole = req.user.role.toLowerCase();
      
      // Admin always has all permissions
      if (userRole === 'admin') {
        return next();
      }
      
      // Find the role in database
      let role = await Role.findOne({ slug: userRole });
      let rolePermissions;
      
      if (!role) {
        rolePermissions = Role.getDefaultPermissions(userRole);
      } else {
        if (!role.isActive) {
          return res.status(403).json({
            success: false,
            message: 'Your role has been deactivated. Please contact an administrator.'
          });
        }
        rolePermissions = role.permissions || {};
      }
      
      // Check if user has all required permissions
      const hasAllPermissions = permissions.every(perm => rolePermissions[perm]);
      
      if (hasAllPermissions) {
        return next();
      }
      
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action'
      });
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking permissions'
      });
    }
  };
};

/**
 * Attach user permissions to request object for use in controllers
 */
export const attachPermissions = async (req, res, next) => {
  if (!req.user) {
    return next();
  }

  try {
    const userRole = req.user.role.toLowerCase();
    
    // Admin has all permissions
    if (userRole === 'admin') {
      req.userPermissions = {
        canCreateDepartment: true,
        canCreateTask: true,
        canCreateProject: true,
        canCreateAnnouncement: true,
        canCreateReminder: true,
        canAssignMembers: true,
        canDeleteTasks: true,
        canDeleteProjects: true
      };
      return next();
    }
    
    // Find the role in database
    let role = await Role.findOne({ slug: userRole });
    
    if (!role) {
      req.userPermissions = Role.getDefaultPermissions(userRole);
    } else {
      req.userPermissions = role.permissions ? role.permissions.toObject() : {};
    }
    
    next();
  } catch (error) {
    console.error('Error attaching permissions:', error);
    req.userPermissions = {};
    next();
  }
};
