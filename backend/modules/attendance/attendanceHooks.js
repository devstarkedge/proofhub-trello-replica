/**
 * Attendance notification + realtime hooks — mirrors leaveHooks.js's shape
 * exactly: one function per event, each going through
 * NotificationDecisionEngine.evaluateAndDeliver(Bulk) once, plus a
 * colon-namespaced Socket.IO event via emitToUser/emitToUsers (personal
 * rooms only — never a shared department/workspace room, same leak risk
 * already confirmed for Leave). Every call is wrapped by its caller in a
 * try/catch — a notification failure must never surface as a failed
 * attendance operation, since the mutation it describes already committed.
 *
 * Precise GPS coordinates/accuracy/distance NEVER enter a realtime payload
 * or notification message (spec §57, §61) — sanitizeSession strips them
 * before anything here touches the wire.
 */
import { evaluateAndDeliver, evaluateAndDeliverBulk } from '../../services/notifications/NotificationDecisionEngine.js';
import { emitToUser, emitToUsers } from '../../realtime/emitters.js';

const EVENTS = {
  CHECKED_IN: 'attendance:checked-in',
  CHECKED_OUT: 'attendance:checked-out',
  DAY_UPDATED: 'attendance:updated',
  WFH_REQUESTED: 'attendance:wfh-requested',
  WFH_DECIDED: 'attendance:wfh-decided',
  REGULARIZATION_REQUESTED: 'attendance:regularization-requested',
  REGULARIZATION_DECIDED: 'attendance:regularization-decided',
  WORK_MODE_OVERRIDE_UPDATED: 'attendance:work-mode-override-updated'
};

/** Strips GPS/location evidence — the only fields a realtime payload may ever carry about a session. */
function sanitizeSession(session) {
  if (!session) return null;
  return {
    _id: session._id, status: session.status, workDateKey: session.workDateKey,
    checkInAt: session.checkInAt, checkOutAt: session.checkOutAt, workMode: session.checkIn?.workMode
  };
}

export function onCheckedIn(userId, session, attendanceDay) {
  emitToUser(userId, EVENTS.CHECKED_IN, { session: sanitizeSession(session), presenceState: attendanceDay?.presenceState });
}

export function onCheckedOut(userId, session, attendanceDay) {
  emitToUser(userId, EVENTS.CHECKED_OUT, { session: sanitizeSession(session), presenceState: attendanceDay?.presenceState, workedMinutes: attendanceDay?.workedMinutes });
}

const entityFor = (request, entityType) => ({ type: entityType, id: request._id || request.id });

export async function onWfhSubmitted(request, requesterUserId) {
  emitToUser(requesterUserId, EVENTS.WFH_REQUESTED, { request });
  await evaluateAndDeliver({
    type: 'attendance_wfh_requested', workspaceId: request.workspaceId, recipientUserId: requesterUserId, notifySelf: true,
    entity: entityFor(request, 'WfhRequest'), title: 'Work-from-home request submitted',
    message: 'Your work-from-home request has been submitted and is awaiting approval.', channels: { inApp: true, slack: false }
  });
}

export async function onWfhApprovalRequired(request, approvalLevels, requesterUserId) {
  const recipientIds = Array.from(new Set(approvalLevels.flatMap((level) => (level.eligibleApproverUserIds || []).map(String))));
  if (!recipientIds.length) return;
  emitToUsers(recipientIds, EVENTS.WFH_REQUESTED, { request });
  await evaluateAndDeliverBulk(recipientIds, {
    type: 'attendance_wfh_approval_required', workspaceId: request.workspaceId, actorUserId: requesterUserId,
    entity: entityFor(request, 'WfhRequest'), title: 'Work-from-home approval required',
    message: 'A work-from-home request is awaiting your approval.', channels: { inApp: true, slack: true }
  });
}

export async function onWfhDecided(result, decidingActor) {
  const { entity: request, approval } = result;
  const decidedByUserId = decidingActor._id || decidingActor.id;
  emitToUser(request.requester, EVENTS.WFH_DECIDED, { request, finalOutcome: result.finalOutcome });

  if (!result.finalOutcome) return; // still awaiting another level — nothing final to notify yet
  const approved = result.finalOutcome === 'APPROVED';
  await evaluateAndDeliver({
    type: approved ? 'attendance_wfh_approved' : 'attendance_wfh_rejected', workspaceId: request.workspaceId,
    recipientUserId: request.requester, actorUserId: decidedByUserId, notifySelf: true,
    entity: entityFor(request, 'WfhRequest'), title: `Work-from-home request ${approved ? 'approved' : 'rejected'}`,
    message: approval.comment || `Your work-from-home request was ${approved ? 'approved' : 'rejected'}.`,
    channels: { inApp: true, slack: true }
  });
}

export async function onRegularizationSubmitted(request, requesterUserId) {
  emitToUser(requesterUserId, EVENTS.REGULARIZATION_REQUESTED, { request });
  await evaluateAndDeliver({
    type: 'attendance_regularization_requested', workspaceId: request.workspaceId, recipientUserId: requesterUserId, notifySelf: true,
    entity: entityFor(request, 'AttendanceRegularization'), title: 'Attendance regularization requested',
    message: 'Your attendance regularization request has been submitted and is awaiting approval.', channels: { inApp: true, slack: false }
  });
}

export async function onRegularizationApprovalRequired(request, approvalLevels, requesterUserId) {
  const recipientIds = Array.from(new Set(approvalLevels.flatMap((level) => (level.eligibleApproverUserIds || []).map(String))));
  if (!recipientIds.length) return;
  emitToUsers(recipientIds, EVENTS.REGULARIZATION_REQUESTED, { request });
  await evaluateAndDeliverBulk(recipientIds, {
    type: 'attendance_regularization_approval_required', workspaceId: request.workspaceId, actorUserId: requesterUserId,
    entity: entityFor(request, 'AttendanceRegularization'), title: 'Attendance regularization approval required',
    message: 'An attendance regularization request is awaiting your approval.', channels: { inApp: true, slack: true }
  });
}

export async function onRegularizationDecided(result, decidingActor) {
  const { entity: request, approval } = result;
  const decidedByUserId = decidingActor._id || decidingActor.id;
  emitToUser(request.requester, EVENTS.REGULARIZATION_DECIDED, { request, finalOutcome: result.finalOutcome });

  if (!result.finalOutcome) return;
  const approved = result.finalOutcome === 'APPROVED';
  await evaluateAndDeliver({
    type: approved ? 'attendance_regularization_approved' : 'attendance_regularization_rejected', workspaceId: request.workspaceId,
    recipientUserId: request.requester, actorUserId: decidedByUserId, notifySelf: true,
    entity: entityFor(request, 'AttendanceRegularization'), title: `Attendance regularization ${approved ? 'approved' : 'rejected'}`,
    message: approval.comment || `Your attendance regularization request was ${approved ? 'approved' : 'rejected'}.`,
    channels: { inApp: true, slack: true }
  });
}

/**
 * A Work Mode Override was created/edited/deactivated (spec §24) — a
 * content-free "your allowed modes may have changed, refetch" nudge, sent
 * only to the exact set of users the change actually affects (the caller
 * resolves this via attendanceWorkModeOverride.service.js#resolveAffectedUserIds
 * — this file never resolves scope membership itself). No notification
 * spam for what is purely a config change, same rationale as
 * leaveHooks.js#onWorkCalendarUpdated.
 */
export function onWorkModeOverrideUpdated(affectedUserIds) {
  if (affectedUserIds?.length) emitToUsers(affectedUserIds, EVENTS.WORK_MODE_OVERRIDE_UPDATED, {});
}

/** Fired by the missing-checkout sweep (Phase 12) — a routine self-reminder, not urgent enough to bypass quiet hours. */
export async function onMissingCheckout(workspaceId, userId, workDateKey) {
  emitToUser(userId, EVENTS.DAY_UPDATED, { workDateKey, presenceState: 'MISSING_CHECKOUT' });
  await evaluateAndDeliver({
    type: 'attendance_missing_checkout', workspaceId, recipientUserId: userId, notifySelf: true,
    title: 'Missing check-out', message: "You didn't check out yesterday. Please submit a regularization request if needed.",
    channels: { inApp: true, slack: false }
  });
}
