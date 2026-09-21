/**
 * The single centralized "how many minutes is this person expected to
 * work today" resolver (new spec §33) — bridges the two expected-minutes
 * concepts that already existed independently in this codebase before this
 * feature: the Work Calendar's calendar-day-type-driven figure (`calendar.
 * expectedMinutes`, from WorkCalendar.standardWorkMinutesPerDay — already
 * consumed by Team Analytics/productivity) and Attendance's own Office-
 * Hours-derived duration for an OFFICE day. Nothing else in the codebase
 * should independently compute "expected minutes today" — see spec §9's
 * "do not create conflicting expected-hour fields" warning.
 *
 * Deliberately read-only/informational: this does NOT feed
 * shiftExpectedMinutes or the full/half/absent duration-tier threshold on
 * AttendanceDay (attendanceStatusResolver.service.js's own
 * effectiveMinFullDayMinutes/effectiveMinHalfDayMinutes, unchanged, still
 * mode-agnostic) — conflating "the duration threshold for tiering" with
 * "the expected duration for reporting" would be exactly the second
 * conflicting field the spec warns against. This is purely the latter.
 */
function minutesSinceMidnight(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * end < start (lexicographically) means an overnight window — same
 * convention as AttendanceShift. Deducts the resolved shift's own
 * breakMinutes when one applies (spec §9: "respecting the existing
 * break/shift architecture") — Office Hours Overrides have no break
 * concept of their own, only Shift does, so this is the one place that
 * tier still matters for Office duration specifically.
 */
function officeHoursDurationMinutes(officeHours, shift) {
  const start = minutesSinceMidnight(officeHours.startLocalTime);
  const end = minutesSinceMidnight(officeHours.endLocalTime);
  const raw = ((end - start) % 1440 + 1440) % 1440;
  return Math.max(0, raw - (shift?.breakMinutes || 0));
}

export function resolveExpectedWorkingMinutes({ workMode, officeHours, calendar, shift = null, leave = null }) {
  if (!calendar?.isWorkingDay) return 0;

  const minutes = (workMode === 'OFFICE' && officeHours?.startLocalTime && officeHours?.endLocalTime)
    ? officeHoursDurationMinutes(officeHours, shift)
    : (calendar.expectedMinutes ?? 0); // WFH/HYBRID(non-office day)/FIELD — reuse the Work Calendar's own figure, never re-derive it

  // A half-day-leave day halves the expectation, mirroring the same
  // presenceFractionCap===0.5 signal attendanceStatusResolver.service.js
  // already uses for duration tiering (spec §10-11).
  return leave?.presenceFractionCap === 0.5 ? Math.round(minutes / 2) : Math.round(minutes);
}
