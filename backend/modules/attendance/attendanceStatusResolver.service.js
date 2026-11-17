import { DateTime } from 'luxon';
import { confirmedCheckoutStatuses } from './attendanceActivity.service.js';
import { attendanceIntervals, intervalMilliseconds, subtractIntervals, scheduleForDay, resolveLeaveCoverage } from './attendanceIntervals.js';

const MINUTE_MS = 60000;
// Existing duration-only office policies use percentage thresholds. The
// fixed-duration selection and clock-based triggers retain their own rules.
export const usesOfficePercentage = (policy, effectiveMode) =>
  effectiveMode === 'OFFICE' && (!policy.halfDayTrigger || policy.halfDayTrigger === 'MINIMUM_DURATION');

/**
 * The single centralized status resolver (spec §31-32). Every dashboard,
 * report, API response, Home quick control, and Teams overlay reads
 * ATTENDANCE STATE through this function's output — nothing recomputes
 * presence/punctuality/leave independently anywhere else in the codebase.
 *
 * Deliberately a PURE function: every upstream fact (eligibility, calendar
 * classification, the applicable policy/shift, Leave reconciliation, the
 * authorized work mode, and the day's raw sessions) is resolved by its own
 * dedicated service BEFORE this is called. This keeps the hardest-to-get-
 * right logic — multi-dimensional status composition — fully unit
 * testable with zero database access, and keeps every one of those
 * upstream concerns owned by exactly one file.
 *
 * `isDayOver` is caller-computed (from workspace tz + shift end + grace)
 * rather than derived here, so a genuinely eager "it's past midnight,
 * mark them Absent" mistake (explicitly forbidden by spec §50) is
 * structurally impossible inside this function — the caller (the daily
 * finalization job) alone decides when a day is truly over.
 */
export function resolveAttendanceStatus({
  eligibility, timezone, calendar, leave, workModeResolution, policyVersion, shift = null, officeHours = null,
  sessions = [], serverNow = new Date(), isDayOver = false, workDateKey = null, breakWindows = []
}) {
  if (!eligibility?.attendanceRequired) {
    throw new Error('resolveAttendanceStatus must never be called for a member who is not attendance-required — callers must short-circuit on eligibility first.');
  }

  const calendarDayType = calendar.dayType;
  const isCalendarWorkingDay = calendar.isWorkingDay;
  const workedOnOffDay = !isCalendarWorkingDay && sessions.length > 0;

  // `workModeResolution.workMode` is the CATEGORICAL label the employee is
  // assigned, surfaced unchanged on every output below (e.g. it stays the
  // literal string 'HYBRID' every day for a Hybrid employee — pre-existing
  // behavior, not part of this fix — see
  // attendanceWorkMode.service.js#authorizeMode). `.effectiveMode` is the
  // CONCRETE mode resolved for THIS business date (always one of
  // OFFICE/WFH/FIELD, e.g. 'OFFICE' on a Hybrid employee's office day) —
  // gating Office Hours on `.workMode` would incorrectly suppress them on
  // every Hybrid employee's actual office day, since it never literally
  // equals 'OFFICE' (new spec §13: resolve the actual mode for each
  // business date, never treat HYBRID as one fixed thing). These two must
  // stay genuinely separate variables — conflating them was a real bug
  // caught during review, not a hypothetical one.
  const workMode = workModeResolution?.workMode || 'OFFICE';
  const resolvedModeForGating = workModeResolution?.effectiveMode || workMode;
  // Office Hours (start/end/grace/early-exit-grace) apply ONLY when the
  // effective work mode for THIS business date is OFFICE (new spec §2,
  // §12-14, §28-29) — WFH, a HYBRID day resolved as WFH, and FIELD never
  // get a late/early-exit clock-time verdict from them, regardless of
  // whether a shift or Office Hours override resolved. `officeHours` is
  // fully resolved upstream (override > shift > workspace policy — see
  // attendanceOfficeHoursOverride.service.js#resolveEffectiveOfficeHours)
  // and passed in already-merged, so this function never re-derives any
  // part of that chain itself.
  const officeHoursApplicable = resolvedModeForGating === 'OFFICE' && Boolean(officeHours?.startLocalTime && officeHours?.endLocalTime);

  const effectiveGraceMinutes = officeHours?.graceMinutes ?? policyVersion.graceMinutes ?? 0;
  const effectiveEarlyExitGraceMinutes = officeHours?.earlyExitGraceMinutes ?? policyVersion.earlyExitGraceMinutes ?? 0;
  const effectiveMinFullDayMinutes = officeHours?.minimumFullDayMinutes ?? shift?.minimumFullDayMinutes ?? policyVersion.minimumFullDayMinutes;
  const effectiveMinHalfDayMinutes = officeHours?.minimumHalfDayMinutes ?? shift?.minimumHalfDayMinutes ?? policyVersion.minimumHalfDayMinutes;

  const closedSessions = sessions.filter((s) => confirmedCheckoutStatuses.includes(s.status));
  const activeSessions = sessions.filter((s) => s.status === 'ACTIVE');
  const missedCheckoutSessions = sessions.filter((s) => s.status === 'MISSED_CHECKOUT');
  const hasActiveSession = activeSessions.length > 0;
  const hasMissedCheckout = missedCheckoutSessions.length > 0;

  const allCheckIns = sessions.map((s) => s.checkInAt).filter(Boolean);
  const firstCheckInAt = allCheckIns.length ? new Date(Math.min(...allCheckIns.map((d) => new Date(d).getTime()))) : null;
  const closedCheckOuts = closedSessions.map((s) => s.checkOutAt).filter(Boolean);
  const lastCheckOutAt = closedCheckOuts.length ? new Date(Math.max(...closedCheckOuts.map((d) => new Date(d).getTime()))) : null;

  const eligibleSessions = sessions.filter(s => !(isDayOver && s.status === 'ACTIVE'));
  const attended = attendanceIntervals(eligibleSessions, serverNow);
  const breaks = breakWindows.map(window => [+window.startsAt, +window.endsAt]);
  const officeMilliseconds = intervalMilliseconds(subtractIntervals(attended, breaks));
  const workedMinutes = officeMilliseconds / MINUTE_MS;
  const dayKey = workDateKey || (firstCheckInAt && DateTime.fromJSDate(firstCheckInAt).setZone(timezone).toISODate());
  const schedule = scheduleForDay({workDateKey:dayKey,timezone,officeHours,shift});
  const coverage = resolveLeaveCoverage(leave,schedule);
  const percentage = usesOfficePercentage(policyVersion, resolvedModeForGating);
  const excusedMilliseconds = intervalMilliseconds(subtractIntervals(
    percentage ? coverage.intervals : coverage.shortIntervals, [...attended, ...breaks]
  ));
  const requiredMilliseconds = Math.max(0, effectiveMinFullDayMinutes * MINUTE_MS - excusedMilliseconds);
  const graceMilliseconds = percentage ? effectiveEarlyExitGraceMinutes * MINUTE_MS : 0;
  const remainingSeconds = !percentage || !isCalendarWorkingDay || leave.leaveState === 'FULL_LEAVE'
    ? null : Math.max(0, requiredMilliseconds - officeMilliseconds - graceMilliseconds) / 1000;
  const duration = {
    officeSeconds: officeMilliseconds / 1000,
    remainingOfficeSeconds: remainingSeconds,
    requiredOfficeSeconds: requiredMilliseconds / 1000,
    durationGraceSeconds: graceMilliseconds / 1000
  };

  const exceptionFlags = [];
  if (sessions.some(s=>s.regularized)) exceptionFlags.push('REGULARIZED');
  if (coverage.unresolved) exceptionFlags.push('LEAVE_COVERAGE_UNRESOLVED');
  if (workedOnOffDay) exceptionFlags.push('WORKED_ON_OFF_DAY');
  if (sessions.some((s) => s.systemGeneratedCheckout)) exceptionFlags.push('SYSTEM_GENERATED_CHECKOUT');
  if (leave.leaveState === 'FULL_LEAVE' && sessions.length > 0) exceptionFlags.push('LEAVE_APPROVED_AFTER_ATTENDANCE');

  // Historical/debugging snapshot of what actually governed today (new
  // spec §24-25) — the timing fields are only populated when Office Hours
  // genuinely applied; `effectiveOfficeHoursSource` is reported regardless
  // (informational: what WOULD govern if this were an OFFICE day).
  const officeHoursSnapshot = {
    effectiveOfficeHoursStart: officeHoursApplicable ? officeHours.startLocalTime : null,
    effectiveOfficeHoursEnd: officeHoursApplicable ? officeHours.endLocalTime : null,
    effectiveOfficeHoursGraceMinutes: officeHoursApplicable ? effectiveGraceMinutes : null,
    effectiveOfficeHoursSource: officeHours?.source || null
  };

  // No sessions at all — nothing to compute; the calendar/leave dimensions
  // still fully describe the day (e.g. HOLIDAY, WEEKLY_OFF, or ON_LEAVE via
  // leaveState=FULL_LEAVE) without ever defaulting to ABSENT here.
  if (sessions.length === 0) {
    const isAbsent = isDayOver && isCalendarWorkingDay && leave.leaveState !== 'FULL_LEAVE' && leave.attendanceExpected;
    return {
      calendarDayType, isCalendarWorkingDay, workMode,
      firstCheckInAt: null, lastCheckOutAt: null, workedMinutes: 0, shiftExpectedMinutes: effectiveMinFullDayMinutes, ...duration,
      lateMinutes: 0, earlyExitMinutes: 0, ...officeHoursSnapshot,
      presenceState: isAbsent ? 'ABSENT' : 'NOT_STARTED',
      punctualityState: null,
      leaveState: leave.leaveState, presenceFraction: 0, leaveFraction: leave.leaveFraction,
      exceptionFlags
    };
  }

  // A session is still open past the point the caller has determined the
  // business day is genuinely over, or has been marked as MISSED_CHECKOUT —
  // this IS the missing-checkout state, never silently treated as any flavor of "present."
  if ((hasActiveSession && isDayOver) || hasMissedCheckout) {
    if (!exceptionFlags.includes('MISSING_CHECKOUT')) {
      exceptionFlags.push('MISSING_CHECKOUT');
    }
    return {
      calendarDayType, isCalendarWorkingDay, workMode,
      firstCheckInAt, lastCheckOutAt, workedMinutes: Math.round(workedMinutes), shiftExpectedMinutes: effectiveMinFullDayMinutes, ...duration,
      lateMinutes: 0, earlyExitMinutes: 0, ...officeHoursSnapshot,
      presenceState: 'MISSING_CHECKOUT', punctualityState: null,
      leaveState: leave.leaveState, presenceFraction: 0, leaveFraction: leave.leaveFraction,
      exceptionFlags
    };
  }

  // Only uncovered scheduled time can trigger punctuality penalties. UTC
  // boundaries avoid minute-of-day errors on overnight shifts and DST dates.
  let lateMilliseconds = 0, earlyExitMilliseconds = 0;
  if (officeHoursApplicable && schedule && isCalendarWorkingDay && leave.leaveState !== 'FULL_LEAVE') {
    const excused = [...coverage.intervals, ...breaks];
    if (firstCheckInAt) lateMilliseconds = Math.max(0, intervalMilliseconds(subtractIntervals(
      [[+schedule.startedAt, Math.min(+firstCheckInAt, +schedule.endedAt)]], coverage.intervals
    )) - effectiveGraceMinutes * MINUTE_MS);
    if (lastCheckOutAt && !hasActiveSession) earlyExitMilliseconds = Math.max(0, intervalMilliseconds(subtractIntervals(
      [[Math.max(+lastCheckOutAt, +schedule.startedAt), +schedule.endedAt]], excused
    )) - (percentage ? 0 : effectiveEarlyExitGraceMinutes * MINUTE_MS));
  }
  const late = lateMilliseconds > 0;
  const leftEarly = earlyExitMilliseconds > 0;

  const punctualityState = hasActiveSession
    ? (late ? 'LATE' : null)
    : (late && leftEarly) ? 'LATE_AND_EARLY_EXIT'
    : late ? 'LATE'
    : leftEarly ? 'EARLY_EXIT'
    : 'ON_TIME';

  // Cap reporting credit on approved half-days. Fixed rules also retain
  // their split half-present/half-leave label.
  const leaveCap = leave.presenceFractionCap ?? 1;
  let durationTier = 'INSUFFICIENT';
  if (percentage) {
    if (officeMilliseconds >= requiredMilliseconds - graceMilliseconds) durationTier = 'FULL';
    else if (4 * officeMilliseconds >= 3 * requiredMilliseconds) durationTier = 'SHORT';
    else if (4 * officeMilliseconds > requiredMilliseconds) durationTier = 'HALF';
  } else {
    const trigger = policyVersion.halfDayTrigger;
    const lateDemotes = late && ['LATE_ARRIVAL', 'COMBINED'].includes(trigger);
    const earlyDemotes = leftEarly && ['EARLY_DEPARTURE', 'COMBINED'].includes(trigger);
    if (officeMilliseconds >= requiredMilliseconds) {
      durationTier = leaveCap === 0.5 || lateDemotes || earlyDemotes ? 'HALF' : 'FULL';
    } else if (officeMilliseconds >= Math.max(0, effectiveMinHalfDayMinutes * MINUTE_MS - excusedMilliseconds)) {
      durationTier = 'HALF';
    }
  }

  let presenceState;
  if (leave.leaveState === 'FULL_LEAVE') {
    // Presence evidence is retained, but no attendance credit or absence penalty
    // is manufactured for a day already fully covered by approved leave.
    presenceState = workedMinutes > 0 || hasActiveSession ? 'PRESENT' : 'NOT_STARTED';
  } else if (hasActiveSession) {
    presenceState = 'PRESENT'; // provisional — still mid-shift, not yet finalized
  } else if (durationTier === 'INSUFFICIENT') {
    presenceState = 'ABSENT';
    exceptionFlags.push('INSUFFICIENT_DURATION');
  } else if (durationTier === 'HALF') {
    presenceState = 'HALF_PRESENT';
  } else if (durationTier === 'SHORT') {
    presenceState = 'SHORT_PRESENT';
  } else {
    presenceState = 'PRESENT';
  }

  // Approved full leave keeps all credit on the leave dimension, while
  // actual presence timestamps/duration remain independently available.
  const credit = { PRESENT: 1, HALF_PRESENT: 0.5, SHORT_PRESENT: officeMilliseconds / requiredMilliseconds }[presenceState] ?? 0;
  const presenceFraction = leave.leaveState === 'FULL_LEAVE' ? 0 : percentage ? leaveCap * credit : Math.min(leaveCap, credit);

  return {
    calendarDayType, isCalendarWorkingDay, workMode,
    firstCheckInAt, lastCheckOutAt, workedMinutes: Math.round(workedMinutes), shiftExpectedMinutes: effectiveMinFullDayMinutes, ...duration,
    lateMinutes: lateMilliseconds / MINUTE_MS, earlyExitMinutes: earlyExitMilliseconds / MINUTE_MS, ...officeHoursSnapshot,
    presenceState, punctualityState: leave.leaveState === 'FULL_LEAVE' ? null : punctualityState,
    leaveState: leave.leaveState, presenceFraction, leaveFraction: leave.leaveFraction,
    exceptionFlags
  };
}
