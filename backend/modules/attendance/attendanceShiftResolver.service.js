import { DateTime } from 'luxon';
import AttendanceShift from './attendanceShift.model.js';
import AttendanceShiftAssignment from './attendanceShiftAssignment.model.js';

const SPECIFICITY_RANK = { user: 2, department: 1, workspace: 0 };

/**
 * Which AttendanceShiftAssignment applies to (userId, date) — mirrors
 * leavePolicy.service.js#resolveAssignmentForUser exactly: most specific
 * scope wins (user > department > workspace default), tie-broken by
 * priority then most recent effectiveFrom.
 */
export async function resolveShiftAssignmentForUser({ workspaceId, userId, membership, date }) {
  const assignments = await AttendanceShiftAssignment.find({
    workspaceId, isActive: true, effectiveFrom: { $lte: date },
    $or: [{ effectiveUntil: null }, { effectiveUntil: { $gte: date } }]
  }).lean();
  if (!assignments.length) return null;

  const departmentIds = (membership?.department || []).map(String);
  const matching = assignments.filter((a) => {
    if (a.scope === 'workspace') return true;
    if (a.scope === 'user') return String(a.scopeRef) === String(userId);
    if (a.scope === 'department') return departmentIds.includes(String(a.scopeRef));
    return false;
  });
  if (!matching.length) return null;

  matching.sort((a, b) => {
    const rankDiff = SPECIFICITY_RANK[b.scope] - SPECIFICITY_RANK[a.scope];
    if (rankDiff !== 0) return rankDiff;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime();
  });
  return matching[0];
}

/**
 * The single entry point for "what shift governs this employee on this
 * date" — precedence: a direct AttendanceMemberProfile.assignedShift
 * override (most specific, set directly on the person) > the assignment
 * table (user > department > workspace default) > the policy version's
 * own defaultShift > null (no shift at all is valid — e.g. a Field
 * employee with no fixed timing).
 */
export async function resolveApplicableShift({ workspaceId, userId, membership, date, profile = null, policyVersion = null }) {
  if (profile?.assignedShift) {
    const shift = await AttendanceShift.findOne({ _id: profile.assignedShift, workspaceId, isActive: true }).lean();
    if (shift) return shift;
  }

  const assignment = await resolveShiftAssignmentForUser({ workspaceId, userId, membership, date });
  if (assignment) {
    const shift = await AttendanceShift.findOne({ _id: assignment.shift, workspaceId, isActive: true }).lean();
    if (shift) return shift;
  }

  if (policyVersion?.defaultShift) {
    const shift = await AttendanceShift.findOne({ _id: policyVersion.defaultShift, workspaceId, isActive: true }).lean();
    if (shift) return shift;
  }

  return null;
}

/** startLocalTime/endLocalTime are zero-padded 'HH:mm', so lexicographic string comparison is a valid same-day-order check. */
export function isOvernightShift(shift) {
  if (!shift) return false;
  return shift.endLocalTime <= shift.startLocalTime;
}

/**
 * The one place workDateKey is computed — called ONLY at check-in. A
 * check-out must never call this again; it always reuses the checked-in
 * session's own stored workDateKey (spec §23's explicit rule: crossing
 * midnight during an overnight shift must never create a "new" workday at
 * check-out time).
 *
 * For a non-overnight shift (or no shift at all), the work date is simply
 * today's calendar date in the workspace timezone. For an overnight shift
 * (e.g. 22:00 -> 06:00), a check-in whose wall-clock time falls before the
 * shift's end time is still inside a shift that started YESTERDAY, so the
 * work date rolls back one day.
 */
export function resolveWorkDateKey({ nowInstant, timezone, shift }) {
  const now = DateTime.fromJSDate(nowInstant instanceof Date ? nowInstant : new Date(nowInstant), { zone: 'utc' }).setZone(timezone);
  const todayKey = now.toFormat('yyyy-MM-dd');

  if (!isOvernightShift(shift)) return todayKey;

  const currentTimeStr = now.toFormat('HH:mm');
  if (currentTimeStr < shift.endLocalTime) {
    return now.minus({ days: 1 }).toFormat('yyyy-MM-dd');
  }
  return todayKey;
}
