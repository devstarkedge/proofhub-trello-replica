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
  WORK_MODE_OVERRIDE_UPDATED: 'attendance:work-mode-override-updated',
  OFFICE_HOURS_OVERRIDE_UPDATED: 'attendance:office-hours-override-updated',
  POLICY_UPDATED: 'attendance:policy-updated',
  LOCATIONS_UPDATED: 'attendance:locations-updated'
};

/** Strips GPS/location evidence — the only fields a realtime payload may ever carry about a session. */
function sanitizeSession(session) {
  if (!session) return null;
  return {
    _id: session._id, status: session.status, workDateKey: session.workDateKey,
    checkInAt: session.checkInAt, checkOutAt: session.checkOutAt, workMode: session.checkIn?.workMode
  };
}

/**
 * `observerUserIds` (new spec §20/TEST 10) — the subject's department
 * manager(s) plus every active Admin/HR member, resolved by the caller via
 * attendanceAuthorization.service.js#resolveAttendanceObserverUserIds.
 * Still only ever personal-room emitToUser/emitToUsers — never a shared
 * department/workspace room — so an observer gets exactly this one
 * employee's event, never a workspace-wide feed. `userId` is included so an
 * observer (who isn't the subject) can tell whose event this is.
 */
export function onCheckedIn(userId, session, attendanceDay, observerUserIds = []) {
  const payload = { userId, session: sanitizeSession(session), presenceState: attendanceDay?.presenceState };
  emitToUser(userId, EVENTS.CHECKED_IN, payload);
  if (observerUserIds.length) emitToUsers(observerUserIds, EVENTS.CHECKED_IN, payload);
}

export function onCheckedOut(userId, session, attendanceDay, observerUserIds = []) {
  const payload = { userId, session: sanitizeSession(session), presenceState: attendanceDay?.presenceState, workedMinutes: attendanceDay?.workedMinutes };
  emitToUser(userId, EVENTS.CHECKED_OUT, payload);
  if (observerUserIds.length) emitToUsers(observerUserIds, EVENTS.CHECKED_OUT, payload);
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

/** An Office Hours override change (new spec §40) — same content-free "refetch" nudge, same affected-users-only fan-out discipline. */
export function onOfficeHoursOverrideUpdated(affectedUserIds) {
  if (affectedUserIds?.length) emitToUsers(affectedUserIds, EVENTS.OFFICE_HOURS_OVERRIDE_UPDATED, {});
}

/** A workspace Attendance Policy version just went live (new spec §40) — fanned out to every active member, since a policy change can affect anyone's current/future calculations; still content-free. */
export function onPolicyUpdated(allMemberUserIds) {
  if (allMemberUserIds?.length) emitToUsers(allMemberUserIds, EVENTS.POLICY_UPDATED, {});
}

/** A Location was created/edited/activated/deactivated/deleted — fanned out to every active member, since workspace-wide location availability affects any attendance-eligible person's next check-in. Content-free "refetch" nudge, same as every other config-change hook here. */
export function onLocationsUpdated(allMemberUserIds) {
  if (allMemberUserIds?.length) emitToUsers(allMemberUserIds, EVENTS.LOCATIONS_UPDATED, {});
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
