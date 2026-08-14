import { hasWorkspacePermission } from '../modules/workspaces/workspacePermissions.js';
import logger from '../utils/logger.js';

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
      logger.warn('Workspace permission denied', {
        userId: req.user.id, workspaceId: req.params.id, permissionKey, path: req.originalUrl
      });
      return res.status(403).json({
        success: false,
        message: `Missing permission: ${permissionKey}`
      });
    }
    next();
  } catch (error) {
    logger.error('requireWorkspacePermission error', {
      error: error.message, userId: req.user?.id, workspaceId: req.params?.id, permissionKey
    });
    res.status(500).json({ success: false, message: 'Failed to verify workspace permission' });
  }
};

export default requireWorkspacePermission;
