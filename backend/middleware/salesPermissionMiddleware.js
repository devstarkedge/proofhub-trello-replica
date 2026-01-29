import SalesPermission from '../models/SalesPermission.js';

/**
 * Middleware to check if user has sales module permission
 */
export const checkSalesPermission = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const userRole = (req.user.role || '').toLowerCase();
    
    // Admin has full access by default
    if (userRole === 'admin') {
      req.salesPermissions = {
        moduleVisible: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canExport: true,
        canImport: true,
        canManageDropdowns: true, // Only admin can manage dropdowns
        canViewActivityLog: true
      };
      return next();
    }

    // Get user permissions for other roles
    const permissions = await SalesPermission.getUserPermissions(userId);

    if (!permissions.moduleVisible) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to the Sales module. Please contact your administrator.'
      });
    }

    // Attach permissions to request for use in routes
    req.salesPermissions = permissions;
    next();
  } catch (error) {
    console.error('Sales permission check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check permissions',
      error: error.message
    });
  }
};

/**
 * Middleware to check specific sales permission
 */
export const requireSalesPermission = (permissionName) => {
  return (req, res, next) => {
    if (!req.salesPermissions) {
      return res.status(403).json({
        success: false,
        message: 'Sales permissions not initialized'
      });
    }

    if (!req.salesPermissions[permissionName]) {
      return res.status(403).json({
        success: false,
        message: `You do not have permission to perform this action (${permissionName})`
      });
    }

    next();
  };
};
