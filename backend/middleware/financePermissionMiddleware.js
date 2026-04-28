import UserPermission, {
  FINANCE_PAGE_KEY,
  FULL_FINANCE_PERMISSIONS,
  normalizePermissionRole
} from '../models/UserPermission.js';

export const checkFinanceAccess = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const userRole = normalizePermissionRole(req.user?.role);

    if (userRole === 'admin') {
      req.financePermissions = { ...FULL_FINANCE_PERMISSIONS, locked: true };
      return next();
    }

    const permissions = await UserPermission.getPagePermissions(userId, userRole, FINANCE_PAGE_KEY);

    if (!permissions.hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to the Finance module. Please contact your administrator.'
      });
    }

    req.financePermissions = permissions;
    return next();
  } catch (error) {
    console.error('Finance permission check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check finance permissions',
      error: error.message
    });
  }
};

export const requireFinancePermission = (permissionName) => {
  return (req, res, next) => {
    if (!req.financePermissions) {
      return res.status(403).json({
        success: false,
        message: 'Finance permissions not initialized'
      });
    }

    if (req.financePermissions[permissionName] !== true) {
      return res.status(403).json({
        success: false,
        message: `You do not have permission to access this finance feature (${permissionName})`
      });
    }

    return next();
  };
};
