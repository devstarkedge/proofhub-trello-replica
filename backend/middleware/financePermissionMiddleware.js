import { resolveResourceAccess } from '../modules/permissions/permissionEngine.js';
import { toLegacyShape } from '../config/permissionRegistry.js';

/**
 * Delegates to the centralized permission engine (AccessOverride, resource
 * 'finance') instead of reading the UserPermission model directly. Keeps the
 * req.financePermissions shape (hasAccess, revenueAnalytics, billingDetails,
 * locked) unchanged so downstream code needs zero changes.
 */
export const checkFinanceAccess = async (req, res, next) => {
  try {
    const result = await resolveResourceAccess(req.user, 'finance');
    const permissions = {
      ...toLegacyShape('finance', result.actions),
      locked: result.source === 'admin'
    };

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
