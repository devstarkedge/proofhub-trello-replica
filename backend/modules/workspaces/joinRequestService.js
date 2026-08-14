import WorkspaceJoinRequest from '../../models/WorkspaceJoinRequest.js';
import WorkspaceInvitation from '../../models/WorkspaceInvitation.js';
import User from '../../models/User.js';
import Workspace from '../../models/Workspace.js';
import Department from '../../models/Department.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { invalidateAuthCache } from '../../middleware/authMiddleware.js';
import { recordAuditLog } from '../permissions/auditLogService.js';
import { listWorkspaceMembersWithPermission } from './workspacePermissions.js';
import * as workspaceContext from './workspaceContext.js';
import { createOrRestoreMembership } from './membershipCreation.js';
import { resolveAssignableRole } from './roleTypeGuard.js';
import { addUserToDepartmentRoster } from './departmentRosterSync.js';
import notificationService from '../../utils/notificationService.js';
import { sendJoinRequestApprovedEmail, sendJoinRequestRejectedEmail } from '../../utils/email.js';
import logger from '../../utils/logger.js';

const CATEGORY = 'workspace_member';

/**
 * Just the row write half of redeeming a `requiresApproval` invitation into
 * a pending WorkspaceJoinRequest (see invitationService.js#acceptInvitation,
 * which calls this inside its accept transaction). Split from the
 * notify/audit side effects below so it can run inside a session/transaction
 * without those effects firing before the transaction actually commits.
 */
export async function createJoinRequestRow(invitation, userId, session = null) {
  try {
    const [joinRequest] = await WorkspaceJoinRequest.create([{
      workspace: invitation.workspace,
      user: userId,
      sourceInvitation: invitation._id,
      requestedDepartment: invitation.requestedDepartment || [],
      requestedRole: invitation.role,
      requestedRoleId: invitation.roleId,
      message: invitation.personalMessage || ''
    }], { session });
    return joinRequest;
  } catch (err) {
    if (err.code === 11000) {
      throw new ErrorResponse('You already have a pending request to join this workspace.', 409);
    }
    throw err;
  }
}

/**
 * Notify approvers + record the audit event for a just-created join request.
 * Called after the transaction that created it has committed. Notification.
 * create needs ambient workspace context (workspaceScopePlugin) that isn't
 * guaranteed at every caller — authController's register() runs the whole
 * accept flow from a public, unauthenticated route with no ambient context
 * at all. Re-establish it here rather than trust the caller.
 */
export async function notifyAndAuditJoinRequestSubmitted(joinRequest, invitation) {
  await workspaceContext.run({ workspaceId: invitation.workspace }, async () => {
    const requestingUser = await User.findById(joinRequest.user).select('name email').lean();
    const approverIds = await listWorkspaceMembersWithPermission(invitation.workspace, 'canApproveJoinRequests');

    if (approverIds.length > 0) {
      await notificationService.notifyJoinRequestSubmitted(
        joinRequest, approverIds, requestingUser?.name || 'Someone'
      );
    }

    await recordAuditLog({
      actor: requestingUser ? { _id: joinRequest.user, name: requestingUser.name, email: requestingUser.email } : null,
      action: 'JOIN_REQUEST_SUBMITTED',
      targetType: 'WorkspaceJoinRequest',
      targetId: joinRequest._id,
      resourceKey: 'workspace_member',
      resourceLabel: 'Workspace Members',
      summary: `${requestingUser?.name || 'A user'} requested to join the workspace`,
      category: CATEGORY,
      meta: { workspaceId: invitation.workspace }
    });
  });
}

/**
 * Composing wrapper kept for any caller that just wants "create + notify +
 * audit" as one step, outside of accept's own transaction.
 */
export async function createJoinRequestFromInvitation(invitation, userId) {
  const joinRequest = await createJoinRequestRow(invitation, userId);
  await notifyAndAuditJoinRequestSubmitted(joinRequest, invitation);
  return joinRequest;
}

/**
 * Pending join requests for the Approval Dashboard, newest first.
 */
export async function listJoinRequests(workspaceId, { status = 'pending' } = {}) {
  return WorkspaceJoinRequest.find({ workspace: workspaceId, status })
    .populate('user', 'name email avatar')
    .populate('requestedDepartment', 'name')
    .populate('requestedRoleId', 'name slug')
    .sort({ createdAt: -1 })
    .lean();
}

/**
 * Approves a pending join request: creates the real WorkspaceMembership
 * (attributed to the ORIGINAL inviter, not the approver — matches
 * WorkspaceMembership.invitedBy's existing meaning elsewhere), optionally
 * overriding the requested department/role first, then closes out the
 * request. Mirrors Method A's Department-roster dual-write so the new
 * member shows up in older UI immediately, same as a direct add.
 *
 * Takes the approver's user object (not just an id) because the role —
 * whether overridden here or simply the originally-requested one — is
 * ALWAYS re-validated through resolveAssignableRole, which needs the
 * approver's own .role for its "only an Admin can grant Admin" check. This
 * used to only run when the approver supplied an explicit override, so
 * approving a self-register invite as-requested skipped both that check and
 * the Team-workspace custom-role guard — closing that gap is the point of
 * this change, not a refactor detail.
 */
export async function approveJoinRequest(joinRequestId, workspaceId, approverUser, overrides = {}) {
  const joinRequest = await WorkspaceJoinRequest.findOne({
    _id: joinRequestId, workspace: workspaceId, status: 'pending'
  });
  if (!joinRequest) {
    throw new ErrorResponse('Join request not found or already reviewed', 404);
  }

  const approverId = approverUser?._id || approverUser?.id;
  const roleSlug = overrides.role
    ? String(overrides.role).toLowerCase()
    : (joinRequest.requestedRole || 'employee');

  const roleDoc = await resolveAssignableRole({ roleSlug, workspaceId, actingUser: approverUser });

  // overrides.department is fresh client input at approval time (unlike
  // joinRequest.requestedDepartment, which — for invitations created after
  // the self_register department check landed — was already validated at
  // invite-creation time) — never trust it without confirming the
  // department actually belongs to this workspace first.
  let department = joinRequest.requestedDepartment || [];
  if (overrides.department) {
    const departmentDoc = await workspaceContext.run({ workspaceId }, async () => (
      await Department.findById(overrides.department).select('_id').lean()
    ));
    if (!departmentDoc) {
      throw new ErrorResponse('Invalid department override', 400);
    }
    department = [overrides.department];
  }

  const sourceInvitation = await WorkspaceInvitation.findById(joinRequest.sourceInvitation)
    .select('invitedBy').lean();

  const { membership } = await createOrRestoreMembership({
    workspaceId,
    userId: joinRequest.user,
    role: roleDoc.slug,
    roleId: roleDoc._id,
    invitedBy: sourceInvitation?.invitedBy || approverId,
    department
  });

  if (department[0]) {
    await addUserToDepartmentRoster(workspaceId, department[0], joinRequest.user, roleDoc.slug);
  }

  joinRequest.status = 'approved';
  joinRequest.reviewedBy = approverId;
  joinRequest.reviewedAt = new Date();
  joinRequest.resultingMembership = membership._id;
  await joinRequest.save();

  // Matches invitationController.js#acceptWorkspaceInvitation's existing
  // "joined" precedent: the workspace you just gained access to becomes
  // your active one. Without this, a requester who registered specifically
  // to join THIS workspace (the common case) would have no other
  // membership to fall back on — protect (authMiddleware.js) would keep
  // 403ing them on their very next request, even though they're now
  // genuinely a member.
  await User.updateOne({ _id: joinRequest.user }, { $set: { lastActiveWorkspace: workspaceId } });
  invalidateAuthCache(joinRequest.user);

  const requestingUser = await User.findById(joinRequest.user).select('name email').lean();
  const workspace = await workspaceContext.runUnscoped(async () => Workspace.findById(workspaceId).select('name').lean());

  if (requestingUser) {
    sendJoinRequestApprovedEmail(requestingUser, { workspaceName: workspace?.name || 'your workspace' }).catch((err) => (
      logger.error('Failed to send join-request-approved email', { error: err.message, userId: String(joinRequest.user), workspaceId })
    ));
    // Notification.create needs ambient workspace context matching THIS
    // workspace specifically — the approver's own ambient context (set by
    // protect from their currently-active workspace) may point elsewhere.
    await workspaceContext.run({ workspaceId }, async () => (
      notificationService.notifyJoinRequestApproved(joinRequest, joinRequest.user, workspace?.name || 'your workspace')
    ));
  }

  await recordAuditLog({
    actor: { _id: approverId },
    action: 'JOIN_REQUEST_APPROVED',
    targetType: 'WorkspaceJoinRequest',
    targetId: joinRequest._id,
    resourceKey: 'workspace_member',
    resourceLabel: 'Workspace Members',
    summary: `Approved ${requestingUser?.name || 'a'} join request — membership ${membership._id} created`,
    category: CATEGORY,
    meta: { workspaceId }
  });

  return { membership, joinRequest };
}

/**
 * Rejects a pending join request. No membership is ever created.
 */
export async function rejectJoinRequest(joinRequestId, workspaceId, rejecterId, reason = '') {
  const joinRequest = await WorkspaceJoinRequest.findOne({
    _id: joinRequestId, workspace: workspaceId, status: 'pending'
  });
  if (!joinRequest) {
    throw new ErrorResponse('Join request not found or already reviewed', 404);
  }

  joinRequest.status = 'rejected';
  joinRequest.reviewedBy = rejecterId;
  joinRequest.reviewedAt = new Date();
  joinRequest.rejectionReason = reason || '';
  await joinRequest.save();

  const requestingUser = await User.findById(joinRequest.user).select('name email').lean();
  const workspace = await workspaceContext.runUnscoped(async () => Workspace.findById(workspaceId).select('name').lean());

  if (requestingUser) {
    sendJoinRequestRejectedEmail(requestingUser, { workspaceName: workspace?.name || 'the workspace', reason }).catch((err) => (
      logger.error('Failed to send join-request-rejected email', { error: err.message, userId: String(joinRequest.user), workspaceId })
    ));
    await workspaceContext.run({ workspaceId }, async () => (
      notificationService.notifyJoinRequestRejected(joinRequest, joinRequest.user, workspace?.name || 'the workspace')
    ));
  }

  await recordAuditLog({
    actor: { _id: rejecterId },
    action: 'JOIN_REQUEST_REJECTED',
    targetType: 'WorkspaceJoinRequest',
    targetId: joinRequest._id,
    resourceKey: 'workspace_member',
    resourceLabel: 'Workspace Members',
    summary: `Rejected ${requestingUser?.name || 'a'} join request${reason ? `: ${reason}` : ''}`,
    category: CATEGORY,
    meta: { workspaceId }
  });

  return { joinRequest };
}

export default {
  createJoinRequestFromInvitation, listJoinRequests, approveJoinRequest, rejectJoinRequest
};
