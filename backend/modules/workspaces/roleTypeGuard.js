import Workspace from '../../models/Workspace.js';
import * as workspaceContext from './workspaceContext.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';

const CUSTOM_ROLE_MESSAGE = 'Custom roles are not supported for Team workspaces';

async function getWorkspaceType(workspaceId) {
  const workspace = await workspaceContext.runUnscoped(() => (
    Workspace.findById(workspaceId).select('type').lean()
  ));
  return workspace?.type || null;
}

/**
 * Blocks creating/editing a custom role in a Team workspace. Used by
 * createRole (always) and updateRole (role is already guaranteed
 * non-system by roleController.js's own isSystem guard).
 */
export async function assertCustomRolesAllowed(workspaceId) {
  const type = await getWorkspaceType(workspaceId);
  if (type === 'team') {
    throw new ErrorResponse(CUSTOM_ROLE_MESSAGE, 403);
  }
}

/**
 * Blocks newly assigning a custom role to a user in a Team workspace.
 * System roles are always fine. Callers must early-return before this on
 * an unchanged role (re-saving a role a user already holds) so existing
 * Team-workspace custom-role holders are grandfathered, not broken.
 */
export async function assertCustomRoleAssignable(workspaceId, roleDoc) {
  if (!roleDoc || roleDoc.isSystem) return;
  await assertCustomRolesAllowed(workspaceId);
}
