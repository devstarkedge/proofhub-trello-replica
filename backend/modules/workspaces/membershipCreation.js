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
 */
export async function createOrRestoreMembership({
  workspaceId, userId, role, roleId, invitedBy, department = [], employeeId = ''
}) {
  const existing = await WorkspaceMembership.findOne({ workspace: workspaceId, user: userId });

  if (existing && existing.status !== 'removed') {
    return { outcome: 'already_member', membership: existing };
  }

  if (existing) {
    existing.status = 'active';
    existing.role = role;
    existing.roleId = roleId;
    existing.department = department;
    existing.employeeId = employeeId;
    existing.accessType = 'full_department';
    existing.allowedProjects = [];
    existing.joinedAt = new Date();
    existing.invitedBy = invitedBy;
    await existing.save();
    return { outcome: 'restored', membership: existing };
  }

  const created = await WorkspaceMembership.create({
    workspace: workspaceId,
    user: userId,
    role,
    roleId,
    department,
    employeeId,
    accessType: 'full_department',
    allowedProjects: [],
    status: 'active',
    invitedBy
  });
  return { outcome: 'created', membership: created };
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
