import { DateTime } from 'luxon';
import { isTimeWithinShortLeaveWindow } from './attendanceLeaveReconciliation.service.js';

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
  sessions = [], serverNow = new Date(), isDayOver = false
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

  const effectiveGraceMinutes = officeHours?.graceMinutes ?? policyVersion.graceMinutes;
  const effectiveEarlyExitGraceMinutes = officeHours?.earlyExitGraceMinutes ?? policyVersion.earlyExitGraceMinutes;
  // Full/half-day DURATION tiering stays mode-agnostic (unchanged, pre-
  // existing behavior) — only the clock-time late/early-exit verdict is
  // OFFICE-gated above; see this file's own module-level note on scope.
  const effectiveMinFullDayMinutes = officeHours?.minimumFullDayMinutes ?? shift?.minimumFullDayMinutes ?? policyVersion.minimumFullDayMinutes;
  const effectiveMinHalfDayMinutes = officeHours?.minimumHalfDayMinutes ?? shift?.minimumHalfDayMinutes ?? policyVersion.minimumHalfDayMinutes;

  const closedSessions = sessions.filter((s) => s.status === 'CLOSED');
  const activeSessions = sessions.filter((s) => s.status === 'ACTIVE');
  const hasActiveSession = activeSessions.length > 0;

  const allCheckIns = sessions.map((s) => s.checkInAt).filter(Boolean);
  const firstCheckInAt = allCheckIns.length ? new Date(Math.min(...allCheckIns.map((d) => new Date(d).getTime()))) : null;
  const closedCheckOuts = closedSessions.map((s) => s.checkOutAt).filter(Boolean);
  const lastCheckOutAt = closedCheckOuts.length ? new Date(Math.max(...closedCheckOuts.map((d) => new Date(d).getTime()))) : null;

  const workedMinutes = sessions.reduce((sum, s) => {
    if (!s.checkInAt) return sum;
    const start = new Date(s.checkInAt).getTime();
    const end = s.status === 'CLOSED' && s.checkOutAt ? new Date(s.checkOutAt).getTime() : (s.status === 'ACTIVE' ? serverNow.getTime() : start);
    return sum + Math.max(0, end - start) / 60000;
  }, 0);

  const exceptionFlags = [];
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
      firstCheckInAt: null, lastCheckOutAt: null, workedMinutes: 0, shiftExpectedMinutes: effectiveMinFullDayMinutes,
      lateMinutes: 0, earlyExitMinutes: 0, ...officeHoursSnapshot,
      presenceState: isAbsent ? 'ABSENT' : 'NOT_STARTED',
      punctualityState: null,
      leaveState: leave.leaveState, presenceFraction: 0, leaveFraction: leave.leaveFraction,
      exceptionFlags
    };
  }

  // A session is still open past the point the caller has determined the
  // business day is genuinely over — this IS the missing-checkout state,
  // never silently treated as any flavor of "present."
  if (hasActiveSession && isDayOver) {
    return {
      calendarDayType, isCalendarWorkingDay, workMode,
      firstCheckInAt, lastCheckOutAt, workedMinutes: Math.round(workedMinutes), shiftExpectedMinutes: effectiveMinFullDayMinutes,
      lateMinutes: 0, earlyExitMinutes: 0, ...officeHoursSnapshot,
      presenceState: 'MISSING_CHECKOUT', punctualityState: null,
      leaveState: leave.leaveState, presenceFraction: 0, leaveFraction: leave.leaveFraction,
      exceptionFlags
    };
  }

  // Late arrival / early exit — computed from wall-clock minute-of-day in
  // the workspace timezone, suppressed for any window validly covered by
  // an approved Short Leave (spec §30, §46), and only ever computed at all
  // when Office Hours actually apply to today's effective work mode.
  let lateMinutes = 0;
  let earlyExitMinutes = 0;
  if (officeHoursApplicable && firstCheckInAt) {
    const checkInLocal = DateTime.fromJSDate(firstCheckInAt, { zone: 'utc' }).setZone(timezone);
    const checkInTimeStr = checkInLocal.toFormat('HH:mm');
    const graceEndMinutes = minutesSinceMidnight(officeHours.startLocalTime) + effectiveGraceMinutes;
    const checkInMinutes = checkInLocal.hour * 60 + checkInLocal.minute;
    const isWithinShortLeave = leave.shortLeaveWindow && isTimeWithinShortLeaveWindow(leave.shortLeaveWindow, checkInTimeStr);
    if (checkInMinutes > graceEndMinutes && !isWithinShortLeave) {
      lateMinutes = checkInMinutes - graceEndMinutes;
    }
  }
  if (officeHoursApplicable && lastCheckOutAt) {
    const checkOutLocal = DateTime.fromJSDate(lastCheckOutAt, { zone: 'utc' }).setZone(timezone);
    const checkOutTimeStr = checkOutLocal.toFormat('HH:mm');
    const earlyExitBoundaryMinutes = minutesSinceMidnight(officeHours.endLocalTime) - effectiveEarlyExitGraceMinutes;
    const checkOutMinutes = checkOutLocal.hour * 60 + checkOutLocal.minute;
    const isWithinShortLeave = leave.shortLeaveWindow && isTimeWithinShortLeaveWindow(leave.shortLeaveWindow, checkOutTimeStr);
    if (checkOutMinutes < earlyExitBoundaryMinutes && !isWithinShortLeave && !hasActiveSession) {
      earlyExitMinutes = earlyExitBoundaryMinutes - checkOutMinutes;
    }
  }

  const punctualityState = hasActiveSession
    ? null // still in progress — punctuality (esp. early-exit) isn't final until checkout
    : (lateMinutes > 0 && earlyExitMinutes > 0) ? 'LATE_AND_EARLY_EXIT'
    : lateMinutes > 0 ? 'LATE'
    : earlyExitMinutes > 0 ? 'EARLY_EXIT'
    : 'ON_TIME';

  // Duration tier, capped by however much of the day Leave already
  // consumed (spec §29's split half-leave/half-present result). The cap
  // only demotes for a genuine HALF_LEAVE day (cap===0.5) — it deliberately
  // does NOT apply when cap is 0 (a FULL_LEAVE-with-sessions contradiction,
  // handled separately below): mechanically capping that case would
  // fabricate an arbitrary final state instead of preserving the raw
  // evidence for authorized review, which spec §84 explicitly forbids.
  const leaveCap = leave.presenceFractionCap ?? 1;
  let durationTier;
  if (workedMinutes >= effectiveMinFullDayMinutes) durationTier = 'FULL';
  else if (workedMinutes >= effectiveMinHalfDayMinutes) durationTier = 'HALF';
  else durationTier = 'INSUFFICIENT';
  if (leaveCap === 0.5 && durationTier === 'FULL') durationTier = 'HALF'; // a half-leave day can never present as a full day

  // Policy-driven half-day trigger (spec §48) — lateness/early-exit can
  // only ever DEMOTE a full day to half, never promote a worse tier.
  const trigger = policyVersion.halfDayTrigger || 'MINIMUM_DURATION';
  const lateDemotes = (trigger === 'LATE_ARRIVAL' || trigger === 'COMBINED') && lateMinutes > 0;
  const earlyDemotes = (trigger === 'EARLY_DEPARTURE' || trigger === 'COMBINED') && earlyExitMinutes > 0 && !hasActiveSession;
  if (durationTier === 'FULL' && (lateDemotes || earlyDemotes)) durationTier = 'HALF';

  let presenceState;
  if (hasActiveSession) {
    presenceState = 'PRESENT'; // provisional — still mid-shift, not yet finalized
  } else if (durationTier === 'INSUFFICIENT') {
    presenceState = 'ABSENT';
    exceptionFlags.push('INSUFFICIENT_DURATION');
  } else if (durationTier === 'HALF') {
    presenceState = 'HALF_PRESENT';
  } else {
    presenceState = 'PRESENT';
  }

  // Derived directly from the final presenceState (not re-computed from
  // durationTier/leaveCap independently) so the two can never disagree.
  const presenceFraction = presenceState === 'ABSENT' ? 0 : presenceState === 'HALF_PRESENT' ? 0.5 : 1;

  return {
    calendarDayType, isCalendarWorkingDay, workMode,
    firstCheckInAt, lastCheckOutAt, workedMinutes: Math.round(workedMinutes), shiftExpectedMinutes: effectiveMinFullDayMinutes,
    lateMinutes: Math.round(lateMinutes), earlyExitMinutes: Math.round(earlyExitMinutes), ...officeHoursSnapshot,
    presenceState, punctualityState,
    leaveState: leave.leaveState, presenceFraction, leaveFraction: leave.leaveFraction,
    exceptionFlags
  };
}

function minutesSinceMidnight(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
