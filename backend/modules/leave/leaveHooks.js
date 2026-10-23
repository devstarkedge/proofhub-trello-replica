import { getActiveWorkspaceId } from '../workspaces/workspaceContext.js';
/**
 * Leave notification hooks — one function per event, mirroring
 * utils/slackHooks.js's shape. Each call goes through
 * NotificationDecisionEngine.evaluateAndDeliver(Bulk) exactly once, with
 * both channels requested together ({inApp:true, slack:true}) — unlike
 * slackHooks.js (which is Slack-only because the in-app channel for the
 * same event is triggered separately by legacy notifyXXX() call sites),
 * Leave has no such legacy split to preserve, so a single call here yields
 * in-app + realtime + email + push + Slack in one place per event.
 *
 * Every call is wrapped by its caller (leaveApproval.service.js,
 * leaveRequest.service.js, etc.) in a try/catch — a notification failure
 * must never surface as a failed business operation, since the mutation it
 * describes has already committed by the time these run.
 */
import { evaluateAndDeliver, evaluateAndDeliverBulk } from '../../services/notifications/NotificationDecisionEngine.js';
import { emitToUser, emitToUsers } from '../../realtime/emitters.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import './leaveApprovalAudience.service.js';
import { canViewLeaveRequest } from './leaveAuthorization.service.js';

const entityFor = (request) => ({ type: 'LeaveRequest', id: request._id || request.id });
const changeFor = (request) => ({ workspaceId: request.workspaceId, requestId: request._id || request.id, updatedAt: request.updatedAt });
async function emitRequestChange(userIds, event, request) {
  const members = await WorkspaceMembership.find({ workspace: request.workspaceId, user: { $in: [...new Set(userIds.map(String))] }, status: 'active' }).select('user role').lean();
  for (const member of members) {
    if (await canViewLeaveRequest({ viewer: { _id: member.user, role: member.role }, requestId: request._id || request.id, workspaceId: request.workspaceId })) {
      emitToUser(member.user, event, changeFor(request), request.workspaceId);
    }
  }
}

// Colon-namespaced, matching this codebase's own module-scoped convention
// (sales:tab:*, finance:page:*) rather than dot-notation. Always emitted via
// emitToUser/emitToUsers (personal rooms) — never a shared department/
// workspace room, per the confirmed leak risk in socketManager.js (every
// department member, not just managers, auto-joins that room on connect).
const EVENTS = {
  REQUEST_CREATED: 'leave:request:created',
  REQUEST_UPDATED: 'leave:request:updated',
  APPROVAL_UPDATED: 'leave:approval:updated',
  BALANCE_UPDATED: 'leave:balance:updated',
  POLICY_UPDATED: 'leave:policy:updated',
  CALENDAR_UPDATED: 'leave:calendar:updated'
};

export async function onRequestSubmitted(request, requesterUserId) {
  await onWorkCalendarUpdated(request.workspaceId).catch(() => {});
  await emitRequestChange([requesterUserId], EVENTS.REQUEST_CREATED, request);

  await evaluateAndDeliver({
    type: 'leave_request_submitted',
    workspaceId: request.workspaceId,
    recipientUserId: requesterUserId,
    notifySelf: true,
    entity: entityFor(request),
    title: 'Leave request submitted',
    message: 'Your leave request has been submitted and is awaiting approval.',
    channels: { inApp: true, slack: false }
  });
}

export async function onApprovalRequired(request, approvalLevels, requesterUserId) {
  const recipientIds = Array.from(new Set(
    approvalLevels.flatMap((level) => (level.eligibleApproverUserIds || []).map(String))
  ));
  if (!recipientIds.length) return;

  await emitRequestChange(recipientIds, EVENTS.APPROVAL_UPDATED, request);

  await evaluateAndDeliverBulk(recipientIds, {
    type: 'leave_approval_required',
    workspaceId: request.workspaceId,
    actorUserId: requesterUserId,
    entity: entityFor(request),
    title: 'Leave approval required',
    message: 'A leave request is awaiting your approval.',
    channels: { inApp: true, slack: true }
  });
}

export async function onApprovalDecisionRecorded(result, decidingActor) {
  await onWorkCalendarUpdated(result.request.workspaceId).catch(() => {});
  const { request, approval } = result;
  const decidedByUserId = decidingActor._id || decidingActor.id;

  await emitRequestChange([request.requester], EVENTS.REQUEST_UPDATED, request);
  // Notify every eligible approver of this level (including whoever just
  // decided it) so a peer who could also have acted on it sees it's resolved.
  await emitRequestChange((result.allLevels || [approval]).flatMap((stage) => stage.eligibleApproverUserIds || []), EVENTS.APPROVAL_UPDATED, request);

  await evaluateAndDeliver({
    type: 'leave_approval_decision_recorded',
    workspaceId: request.workspaceId,
    recipientUserId: request.requester,
    actorUserId: decidedByUserId,
    entity: entityFor(request),
    title: `Leave request ${approval.status.toLowerCase()} at ${approval.level.replace('_', ' ').toLowerCase()} level`,
    message: approval.comment || `Your leave request was ${approval.status.toLowerCase()} at the ${approval.level.replace('_', ' ').toLowerCase()} stage.`,
    channels: { inApp: true, slack: false }
  });
}

export async function onRequestApproved(request) {
  await onWorkCalendarUpdated(request.workspaceId).catch(() => {});
  await emitRequestChange([request.requester], EVENTS.REQUEST_UPDATED, request);
  emitToUser(request.requester, EVENTS.BALANCE_UPDATED, { workspaceId: request.workspaceId, userId: request.requester });

  await evaluateAndDeliver({
    type: 'leave_request_approved',
    workspaceId: request.workspaceId,
    recipientUserId: request.requester,
    notifySelf: true,
    entity: entityFor(request),
    title: 'Leave request approved',
    message: 'Your leave request has been fully approved.',
    channels: { inApp: true, slack: true }
  });
}

export async function onRequestRejected(request) {
  await onWorkCalendarUpdated(request.workspaceId).catch(() => {});
  await emitRequestChange([request.requester], EVENTS.REQUEST_UPDATED, request);
  emitToUser(request.requester, EVENTS.BALANCE_UPDATED, { workspaceId: request.workspaceId, userId: request.requester });

  await evaluateAndDeliver({
    type: 'leave_request_rejected',
    workspaceId: request.workspaceId,
    recipientUserId: request.requester,
    notifySelf: true,
    entity: entityFor(request),
    title: 'Leave request rejected',
    message: 'Your leave request was rejected.',
    channels: { inApp: true, slack: true }
  });
}

/** Employee cancelled their own still-pending request — let any still-pending approver know no action is needed. */
export async function onRequestCancelled(request, cancelledByUserId, pendingApprovalLevels = []) {
  await onWorkCalendarUpdated(request.workspaceId).catch(() => {});
  await emitRequestChange([request.requester], EVENTS.REQUEST_UPDATED, request);
  emitToUser(request.requester, EVENTS.BALANCE_UPDATED, { workspaceId: request.workspaceId, userId: request.requester });

  const pendingApproverIds = Array.from(new Set(
    pendingApprovalLevels.flatMap((level) => (level.eligibleApproverUserIds || []).map(String))
  ));
  if (pendingApproverIds.length) await emitRequestChange(pendingApproverIds, EVENTS.APPROVAL_UPDATED, request);

  await evaluateAndDeliver({
    type: 'leave_request_cancelled',
    workspaceId: request.workspaceId,
    recipientUserId: request.requester,
    actorUserId: cancelledByUserId,
    notifySelf: true,
    entity: entityFor(request),
    title: 'Leave request cancelled',
    message: 'Your leave request has been cancelled.',
    channels: { inApp: true, slack: false }
  });

  if (pendingApproverIds.length) {
    await evaluateAndDeliverBulk(pendingApproverIds, {
      type: 'leave_request_cancelled',
      workspaceId: request.workspaceId,
      actorUserId: cancelledByUserId,
      entity: entityFor(request),
      title: 'Leave request cancelled',
      message: 'A leave request awaiting your approval has been cancelled by the requester.',
      channels: { inApp: true, slack: false }
    });
  }
}

/** Employee requested cancellation of an already-approved leave — notify HR/Admin to review. */
export async function onCancellationRequested(request, requestedByUserId, reviewerUserIds = []) {
  await onWorkCalendarUpdated(request.workspaceId).catch(() => {});
  await emitRequestChange([request.requester], EVENTS.REQUEST_UPDATED, request);
  const recipientIds = Array.from(new Set(reviewerUserIds.map(String)));
  if (!recipientIds.length) return;
  await evaluateAndDeliverBulk(recipientIds, {
    type: 'leave_cancellation_requested',
    workspaceId: request.workspaceId,
    actorUserId: requestedByUserId,
    entity: entityFor(request),
    title: 'Leave cancellation requested',
    message: 'An employee has requested cancellation of their approved leave.',
    channels: { inApp: true, slack: true }
  });
}

/** HR/Admin cancelled an already-approved leave (e.g. the employee ended up working that day). */
export async function onCancelledByHr(request, cancelledByUserId, reason) {
  await onWorkCalendarUpdated(request.workspaceId).catch(() => {});
  await emitRequestChange([request.requester], EVENTS.REQUEST_UPDATED, request);
  emitToUser(request.requester, EVENTS.BALANCE_UPDATED, { workspaceId: request.workspaceId, userId: request.requester });

  await evaluateAndDeliver({
    type: 'leave_cancelled_by_hr',
    workspaceId: request.workspaceId,
    recipientUserId: request.requester,
    actorUserId: cancelledByUserId,
    notifySelf: true,
    entity: entityFor(request),
    title: 'Approved leave cancelled',
    message: reason ? `Your approved leave was cancelled: ${reason}` : 'Your approved leave was cancelled.',
    channels: { inApp: true, slack: true }
  });
}

export async function onBalanceAdjusted({ workspaceId, userId, actorUserId, leaveTypeName, amount, reason }) {
  emitToUser(userId, EVENTS.BALANCE_UPDATED, { workspaceId, userId });

  await evaluateAndDeliver({
    type: 'leave_balance_adjusted',
    workspaceId,
    recipientUserId: userId,
    actorUserId,
    notifySelf: true,
    title: 'Leave balance adjusted',
    message: `Your ${leaveTypeName} balance was adjusted by ${amount > 0 ? '+' : ''}${amount}${reason ? `: ${reason}` : '.'}`,
    channels: { inApp: true, slack: false }
  });
}

export async function onBucketExpired({ workspaceId, userId, leaveTypeName, amount }) {
  if (amount <= 0) return;
  emitToUser(userId, EVENTS.BALANCE_UPDATED, { workspaceId, userId });

  await evaluateAndDeliver({
    type: 'leave_bucket_expired',
    workspaceId,
    recipientUserId: userId,
    notifySelf: true,
    title: 'Leave balance expired',
    message: `${amount} unused ${leaveTypeName} leave has expired.`,
    channels: { inApp: true, slack: false }
  });
}

/** Routine monthly/manual credit landed — realtime balance refresh only, no notification (avoid monthly spam). */
export function onBucketCredited({ userId, workspaceId = getActiveWorkspaceId() }) {
  emitToUser(userId, EVENTS.BALANCE_UPDATED, { workspaceId, userId });
}

export async function onApprovalReminder(request, approval) {
  const recipientIds = (approval.eligibleApproverUserIds || []).map(String);
  if (!recipientIds.length) return;
  await evaluateAndDeliverBulk(recipientIds, {
    type: 'leave_approval_reminder',
    workspaceId: request.workspaceId,
    entity: entityFor(request),
    title: 'Reminder: leave approval pending',
    message: 'A leave request is still awaiting your approval.',
    channels: { inApp: true, slack: true }
  });
}

/**
 * A default policy activated (or its scheduled activation was promoted) —
 * push active members a realtime nudge to refresh authorized policy views.
 * Content-free (no per-user leave data), so unlike a leave-request/approval
 * event this is safe to fan out widely; still routed through emitToUsers
 * (personal rooms) rather than a shared room for consistency with the rest
 * of this module.
 */
export async function onPolicyActivated(workspaceId) {
  const members = await WorkspaceMembership.find({ workspace: workspaceId, status: 'active' }).select('user').lean();
  // Custom policy administrators and employee calculations also need to
  // refresh. Send only an invalidation; authorized APIs return the data.
  if (members.length) emitToUsers(members.map((member) => String(member.user)), EVENTS.POLICY_UPDATED, { workspaceId });
  await onWorkCalendarUpdated(workspaceId);
}

/**
 * The workspace's Work Calendar or Holiday list changed — every employee's
 * own leave calendar / request form depends on this classification, so the
 * refresh nudge goes to every active member, not just HR/Admin. Carries no
 * per-user data (just "something changed, refetch"), so a broad fan-out is
 * safe even though it's still sent via personal rooms one by one rather
 * than a shared department/workspace room.
 */
export async function onWorkCalendarUpdated(workspaceId) {
  const members = await WorkspaceMembership.find({ workspace: workspaceId, status: 'active' }).select('user').lean();
  const userIds = members.map((m) => String(m.user));
  if (userIds.length) emitToUsers(userIds, EVENTS.CALENDAR_UPDATED, { workspaceId });
}

export async function onApprovalEscalated(request, approval, escalatedToUserIds) {
  const recipientIds = Array.from(new Set((escalatedToUserIds || []).map(String)));
  if (!recipientIds.length) return;
  await emitRequestChange(recipientIds, EVENTS.APPROVAL_UPDATED, request);

  await evaluateAndDeliverBulk(recipientIds, {
    type: 'leave_approval_escalated',
    workspaceId: request.workspaceId,
    entity: entityFor(request),
    title: 'Escalated: leave approval overdue',
    message: 'A leave approval has been pending too long and was escalated to you.',
    channels: { inApp: true, slack: true }
  });
}
