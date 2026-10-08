import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import { invalidateAuthCache } from '../../middleware/authMiddleware.js';

// Legacy callers retain this name during rollout. It invalidates cached
// memberships only; identity mirrors must never overwrite tenant access.
export async function syncMembershipFromUser(userId, workspaceId) {
  // Compatibility invalidation only. Global identity fields must never be
  // imported into workspace authorization, nor manufacture a membership.
  if (!userId || !workspaceId) return;
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
