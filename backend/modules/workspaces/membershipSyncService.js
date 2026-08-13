import User from '../../models/User.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import { invalidateAuthCache } from '../../middleware/authMiddleware.js';

/**
 * The overlay in `protect` (backend/middleware/authMiddleware.js) reads
 * role/department/accessType/allowedProjects from WorkspaceMembership, not
 * from User, once a request is workspace-aware. Every legacy endpoint that
 * still writes those fields directly onto the User document (kept as the
 * default-workspace mirror — see User.js) must also mirror the write into
 * that user's membership row here, or the change will appear not to take
 * effect for anyone past the first workspace.
 *
 * Call sites (verified, grep-audited): authController.register,
 * userController.patchUserPagePermissions/updateUser/
 * verifyUser/assignUser/changeUserRole, departmentController.
 * createDepartment/updateDepartment/addMemberToDepartment/
 * removeMemberFromDepartment/unassignUserFromDepartment/
 * bulkAssignUsersToDepartment/bulkUnassignUsersFromDepartment.
 *
 * Operates on the *actor's own* current workspace — correct here, since
 * every one of these is a "manage a user in my organization" action, not a
 * cross-workspace operation.
 */
export async function syncMembershipFromUser(userId, workspaceId) {
  if (!userId || !workspaceId) return;

  const user = await User.findById(userId).lean();
  if (!user) return;

  await WorkspaceMembership.findOneAndUpdate(
    { user: userId, workspace: workspaceId },
    {
      $set: {
        role: user.role,
        roleId: user.roleId,
        department: user.department || [],
        team: user.team,
        accessType: user.accessType,
        allowedProjects: user.allowedProjects || []
      },
      $setOnInsert: {
        user: userId,
        workspace: workspaceId,
        status: 'active',
        joinedAt: user.createdAt || new Date()
      }
    },
    { upsert: true }
  );

  invalidateAuthCache(userId);
}

/**
 * Guards every "manage an existing member" endpoint (role/department/access
 * edits) against operating on a user who isn't actually a member of the
 * acting workspace. Without this, syncMembershipFromUser's upsert would
 * silently create a brand-new membership (with whatever role/department was
 * submitted) for a user who never joined that workspace, reachable simply by
 * knowing their userId. Registration/invite-acceptance/admin-verification
 * flows create the first membership deliberately and do not call this guard.
 */
export async function isActiveWorkspaceMember(userId, workspaceId) {
  if (!userId || !workspaceId) return false;
  return Boolean(await WorkspaceMembership.exists({ user: userId, workspace: workspaceId, status: 'active' }));
}

export default syncMembershipFromUser;
