import { canManageAccessControl, hasResourceAction } from '../modules/permissions/permissionEngine.js';

/**
 * Gate for the centralized Access & Permissions module itself. Admin always
 * passes; anyone else needs the delegated access_control.manage permission
 * (granted via their role's canManageAccessControl flag or a personal
 * AccessOverride). This is a strict superset of the old authorize('admin')
 * checks it replaces, so existing admin-only behavior never regresses —
 * it only adds the ability to delegate.
 */
export const requireAccessControlManage = async (req, res, next) => {
  try {
    const allowed = await canManageAccessControl(req.user);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage access control.'
      });
    }
    next();
  } catch (error) {
    console.error('requireAccessControlManage error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify access control permission' });
  }
};

/**
 * Composite guard for user-management routes (list users, change role,
 * assign department/scope) that historically only accepted a fixed role
 * list. Passes if the caller's role is in `roles` (Admin always included),
 * OR falls back to the delegated access_control.manage check — so a
 * custom-role user granted that permission can manage users through the
 * centralized Access & Permissions module without being Admin/Manager/HR.
 * Strict superset of the role list alone; nothing that passed before loses
 * access.
 */
export const allowRolesOrAccessControlManage = (...roles) => async (req, res, next) => {
  try {
    const normalizedUserRole = String(req.user?.role || '').toLowerCase();
    const normalizedRoles = roles.map((r) => r.toLowerCase());
    if (normalizedUserRole === 'admin' || normalizedRoles.includes(normalizedUserRole)) {
      return next();
    }
    const allowed = await canManageAccessControl(req.user);
    if (allowed) return next();
    return res.status(403).json({
      success: false,
      message: `User role '${req.user?.role}' is not authorized to access this route`
    });
  } catch (error) {
    console.error('allowRolesOrAccessControlManage error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify permission' });
  }
};

/**
 * Generic resource.action route guard, backed by the same resolver used
 * everywhere else. New routes should prefer this over ad hoc role checks.
 */
export const requireResourcePermission = (resource, actionKey) => async (req, res, next) => {
  try {
    const allowed = await hasResourceAction(req.user, resource, actionKey);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: `Missing permission: ${resource}.${actionKey}`
      });
    }
    next();
  } catch (error) {
    console.error('requireResourcePermission error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify permission' });
  }
};
