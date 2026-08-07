import { resolveResourceAccess } from '../modules/permissions/permissionEngine.js';
import { toLegacyShape } from '../config/permissionRegistry.js';

/**
 * Middleware to check if user has sales module permission.
 *
 * Delegates to the centralized permission engine (AccessOverride, resource
 * 'sales') instead of reading the SalesPermission model directly. The
 * req.salesPermissions shape is kept exactly as before (moduleVisible,
 * canCreate, ...) so every downstream route/controller that reads it needs
 * zero changes.
 */
export const checkSalesPermission = async (req, res, next) => {
  try {
    const result = await resolveResourceAccess(req.user, 'sales');
    const permissions = toLegacyShape('sales', result.actions);

    if (!permissions.moduleVisible) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to the Sales module. Please contact your administrator.'
      });
    }

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
