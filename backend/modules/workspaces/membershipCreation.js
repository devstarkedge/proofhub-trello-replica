import WorkspaceMembership from '../../models/WorkspaceMembership.js';

/**
 * Shared "add this user to this workspace" core, reused by
 * addWorkspaceMember (HR Panel's existing-user picker), inviteWorkspaceMembers's
 * existing-user branch, and the invitation-accept endpoint.
 *
 * A user can only ever have ONE WorkspaceMembership row per workspace (the
 * {workspace,user} unique index enforces this) — removal is a soft-delete
 * (status: 'removed'), so re-adding a previously-removed user must RESTORE
 * that row rather than attempt a second insert (which would violate the
 * unique index) or silently no-op.
 *
 * Returns { outcome: 'created' | 'restored' | 'already_member', membership }.
 * Never throws for the "already a member" case — that's a normal, expected
 * outcome the caller decides how to report, not an error.
 *
 * Atomic by construction: the filter only ever matches a 'removed' row (the
 * one case that should be updated in place), so any concurrent caller racing
 * to add the SAME user to the SAME workspace — whether because no row exists
 * yet, or because an active/suspended row already does — collides on the
 * {workspace,user} unique index instead of both succeeding. That collision
 * (E11000) is caught below and resolved to 'already_member', never thrown,
 * which is what makes accept-invitation idempotent under a double-submit or
 * network retry (see invitationService.js#acceptInvitation). Pass `session`
 * to participate in a caller's transaction; omit it to run standalone,
 * exactly as every call site before this fix already did.
 */
export async function createOrRestoreMembership({
  workspaceId, userId, role, roleId, invitedBy, department = [], employeeId = '', session = null
}) {
  try {
    const result = await WorkspaceMembership.findOneAndUpdate(
      { workspace: workspaceId, user: userId, status: 'removed' },
      {
        $set: {
          status: 'active',
          role,
          roleId,
          department,
          employeeId,
          accessType: 'full_department',
          allowedProjects: [],
          joinedAt: new Date(),
          invitedBy
        },
        $setOnInsert: { workspace: workspaceId, user: userId }
      },
      { upsert: true, new: true, rawResult: true, session }
    );

    const outcome = result.lastErrorObject?.updatedExisting ? 'restored' : 'created';
    return { outcome, membership: result.value };
  } catch (err) {
    if (err.code === 11000) {
      const existing = await WorkspaceMembership.findOne({ workspace: workspaceId, user: userId }).session(session).lean();
      return { outcome: 'already_member', membership: existing };
    }
    throw err;
  }
}

/**
 * Tells a specific user's OTHER open tabs/sessions "you were just added to
 * a workspace, refresh your switcher" — reaches every socket connection for
 * that user (sockets join a personal ROOM.user(userId) room regardless of
 * active workspace — see backend/realtime/socketManager.js), not just
 * whichever tab/request triggered the add.
 */
export async function notifyMembershipAdded(userId, workspaceId) {
  try {
    const { emitToUser } = await import('../../realtime/index.js');
    emitToUser(userId.toString(), 'workspace-membership-added', { workspaceId: workspaceId.toString() });
  } catch (err) {
    console.error('Failed to emit workspace-membership-added:', err);
  }
}

export default createOrRestoreMembership;
