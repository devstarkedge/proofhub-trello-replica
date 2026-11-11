import AttendanceSession from './attendanceSession.model.js';

export const INACTIVITY_MS = 30 * 60 * 1000;
const MAX_SAMPLE_AGE_MS = 2 * 60 * 1000;

export const confirmedCheckoutStatuses = ['CLOSED', 'COMPLETED', 'AUTO_CHECKOUT'];

// A scheduled session's fallback deadline is enforced only by the attendance
// lifecycle, which can atomically arbitrate a new input sample against closure.
export function legacyHardCutoff(session) {
  return session?.effectiveShiftEndAt ? null : session?.missedCheckoutCutoffAt;
}

export function publicAttendanceSession(session) {
  if (session?.status !== 'ACTIVE' || !session.effectiveShiftEndAt) return session;
  return { ...(session.toObject ? session.toObject() : session), missedCheckoutCutoffAt: null };
}

export function attendanceFallbackCutoffExpression(path = '$') {
  return { $cond: [
    { $and: [
      { $eq: [path + 'status', 'ACTIVE'] },
      { $ne: [{ $ifNull: [path + 'effectiveShiftEndAt', null] }, null] }
    ] },
    null,
    path + 'missedCheckoutCutoffAt'
  ] };
}

export function freshActivityTime(value, now) {
  if (!Number.isSafeInteger(value) || value < +now - MAX_SAMPLE_AGE_MS || value > +now + 2000) return null;
  return new Date(Math.min(value, +now));
}

export async function recordAttendanceActivity({ workspaceId, userId, attendanceSessionId, activityAt, now = new Date() }) {
  const observedAt = freshActivityTime(activityAt, now);
  if (!observedAt || typeof attendanceSessionId !== 'string' || !/^[a-f\d]{24}$/i.test(attendanceSessionId)) return;

  // Reject replays and input after an already-expired post-shift deadline.
  // The same row fences activity against checkout across API and worker processes.
  await AttendanceSession.updateOne({
    _id: attendanceSessionId, workspaceId, user: userId, status: 'ACTIVE',
    effectiveShiftEndAt: { $type: 'date' }, checkInAt: { $lte: observedAt },
    $or: [
      { lastActivityAt: null },
      { lastActivityAt: { $lt: observedAt }, effectiveShiftEndAt: { $gt: observedAt } },
      { lastActivityAt: { $lt: observedAt, $gt: new Date(+observedAt - INACTIVITY_MS) } }
    ]
  }, { $max: {
    lastActivityAt: observedAt,
    autoCheckoutDueAt: new Date(+observedAt + INACTIVITY_MS)
  } });
}

export function attendanceClosureCandidate(session, now) {
  if (session.status !== 'ACTIVE') return null;
  const shiftEnd = session.effectiveShiftEndAt;
  if (shiftEnd && session.lastActivityAt) {
    const dueAt = Math.max(+shiftEnd, +session.lastActivityAt + INACTIVITY_MS);
    return +now >= dueAt ? { reason: 'POST_SHIFT_INACTIVITY', at: session.lastActivityAt } : null;
  }
  if (!session.missedCheckoutCutoffAt) return null;
  const at = new Date(Math.max(+session.missedCheckoutCutoffAt, shiftEnd ? +shiftEnd : 0));
  return +now >= +at ? { reason: shiftEnd ? 'MISSING_ACTIVITY_TELEMETRY' : 'MISSED_CHECKOUT_CUTOFF', at } : null;
}
