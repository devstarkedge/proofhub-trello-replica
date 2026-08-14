import Workspace from '../../models/Workspace.js';
import Role from '../../models/Role.js';
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

/**
 * The one place every invite/approval entry point resolves and validates a
 * role to assign — so no controller can skip a check by re-implementing
 * this inline (which is exactly how inviteMemberSelfRegister and
 * approveJoinRequest's no-override path used to skip both the Team-workspace
 * custom-role guard and the admin-grant guard that inviteMemberDirect always
 * had). Never trust a roleId/roleSlug from the request body without routing
 * it through this.
 */
export async function resolveAssignableRole({ roleSlug, workspaceId, actingUser }) {
  const roleDoc = await workspaceContext.run({ workspaceId }, async () => (
    await Role.findResolvable(roleSlug, workspaceId)
  ));
  if (!roleDoc) {
    throw new ErrorResponse('Invalid role', 400);
  }

  await assertCustomRoleAssignable(workspaceId, roleDoc);

  // Mirrors userController.js's "only a genuine Admin may grant Admin
  // access" rule — a canInviteMembers/canApproveJoinRequests holder who
  // isn't themselves an Admin must not be able to mint one.
  if (roleDoc.slug === 'admin' && actingUser?.role !== 'admin') {
    throw new ErrorResponse('Only an Admin can grant Admin access', 403);
  }

  return roleDoc;
}
