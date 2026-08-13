import WorkspaceJoinRequest from '../../models/WorkspaceJoinRequest.js';
import WorkspaceInvitation from '../../models/WorkspaceInvitation.js';
import User from '../../models/User.js';
import Role from '../../models/Role.js';
import Workspace from '../../models/Workspace.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { invalidateAuthCache } from '../../middleware/authMiddleware.js';
import { recordAuditLog } from '../permissions/auditLogService.js';
import { listWorkspaceMembersWithPermission } from './workspacePermissions.js';
import * as workspaceContext from './workspaceContext.js';
import { createOrRestoreMembership } from './membershipCreation.js';
import { assertCustomRoleAssignable } from './roleTypeGuard.js';
import { addUserToDepartmentRoster } from './departmentRosterSync.js';
import notificationService from '../../utils/notificationService.js';
import { sendJoinRequestApprovedEmail, sendJoinRequestRejectedEmail } from '../../utils/email.js';

const CATEGORY = 'workspace_member';

/**
 * Redeems a `requiresApproval` invitation into a pending WorkspaceJoinRequest
 * instead of an immediate membership — see invitationService.js
 * #acceptInvitation. No WorkspaceMembership exists until an
 * canApproveJoinRequests holder later approves it (approveJoinRequest below).
 */
export async function createJoinRequestFromInvitation(invitation, userId) {
  let joinRequest;
  try {
    joinRequest = await WorkspaceJoinRequest.create({
      workspace: invitation.workspace,
      user: userId,
      sourceInvitation: invitation._id,
      requestedDepartment: invitation.requestedDepartment || [],
      requestedRole: invitation.role,
      requestedRoleId: invitation.roleId,
      message: invitation.personalMessage || ''
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new ErrorResponse('You already have a pending request to join this workspace.', 409);
    }
    throw err;
  }

  // Notification.create needs ambient workspace context (workspaceScopePlugin)
  // that isn't guaranteed at every caller of this function — authController's
  // register() runs this from a public, unauthenticated route with no
  // ambient context at all. Re-establish it here rather than trust the caller.
  await workspaceContext.run({ workspaceId: invitation.workspace }, async () => {
    const requestingUser = await User.findById(userId).select('name email').lean();
    const approverIds = await listWorkspaceMembersWithPermission(invitation.workspace, 'canApproveJoinRequests');

    if (approverIds.length > 0) {
      await notificationService.notifyJoinRequestSubmitted(
        joinRequest, approverIds, requestingUser?.name || 'Someone'
      );
    }

    await recordAuditLog({
      actor: requestingUser ? { _id: userId, name: requestingUser.name, email: requestingUser.email } : null,
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
 */
export async function approveJoinRequest(joinRequestId, workspaceId, approverId, overrides = {}) {
  const joinRequest = await WorkspaceJoinRequest.findOne({
    _id: joinRequestId, workspace: workspaceId, status: 'pending'
  });
  if (!joinRequest) {
    throw new ErrorResponse('Join request not found or already reviewed', 404);
  }

  let roleSlug = joinRequest.requestedRole || 'employee';
  let roleId = joinRequest.requestedRoleId;
  if (overrides.role) {
    const roleDoc = await workspaceContext.run({ workspaceId }, async () => (
      await Role.findResolvable(String(overrides.role).toLowerCase(), workspaceId)
    ));
    if (!roleDoc) {
      throw new ErrorResponse('Invalid role override', 400);
    }
    await assertCustomRoleAssignable(workspaceId, roleDoc);
    roleSlug = roleDoc.slug;
    roleId = roleDoc._id;
  }

  const department = overrides.department
    ? [overrides.department]
    : (joinRequest.requestedDepartment || []);

  const sourceInvitation = await WorkspaceInvitation.findById(joinRequest.sourceInvitation)
    .select('invitedBy').lean();

  const { membership } = await createOrRestoreMembership({
    workspaceId,
    userId: joinRequest.user,
    role: roleSlug,
    roleId,
    invitedBy: sourceInvitation?.invitedBy || approverId,
    department
  });

  if (department[0]) {
    await addUserToDepartmentRoster(workspaceId, department[0], joinRequest.user, roleSlug);
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
      console.error('Failed to send join-request-approved email:', err.message)
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
      console.error('Failed to send join-request-rejected email:', err.message)
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
