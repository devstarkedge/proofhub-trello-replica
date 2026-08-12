import { hasWorkspacePermission } from '../modules/workspaces/workspacePermissions.js';

/**
 * Gate for the centralized Invite Member system's routes — resolves through
 * the caller's WorkspaceMembership -> Role.permissions, never a hardcoded
 * role string. Expects the workspace id on req.params.id, matching every
 * other /api/workspaces/:id/... route in this codebase.
 */
export const requireWorkspacePermission = (permissionKey) => async (req, res, next) => {
  try {
    const allowed = await hasWorkspacePermission(req.user.id, req.params.id, permissionKey);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: `Missing permission: ${permissionKey}`
      });
    }
    next();
  } catch (error) {
    console.error('requireWorkspacePermission error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify workspace permission' });
  }
};

export default requireWorkspacePermission;
