/**
 * Picks ONE display label for a resolved AttendanceDay/today-status result
 * — never re-derives status itself, just chooses which single label best
 * represents an already-resolved combination of dimensions. Precedence: a
 * non-working calendar day or full leave wins (nothing else about
 * presence matters that day), then a punctuality problem is surfaced
 * alongside presence, then plain presenceState.
 */
export function resolveDisplayStatus(day) {
  if (!day) return 'NOT_STARTED';
  if (day.leaveState === 'FULL_LEAVE') return 'ON_LEAVE';
  if (day.calendarDayType === 'HOLIDAY') return 'HOLIDAY';
  if (day.calendarDayType && !day.isCalendarWorkingDay) return 'WEEKLY_OFF';
  if (day.presenceState === 'PRESENT' && (day.punctualityState === 'LATE' || day.punctualityState === 'LATE_AND_EARLY_EXIT')) return 'LATE';
  return day.presenceState || 'NOT_STARTED';
}
