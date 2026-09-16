import { DateTime } from 'luxon';

export const DEFAULT_WORKSPACE_TIMEZONE = 'Asia/Kolkata';

/**
 * Every read of a workspace's timezone must go through here, never a bare
 * `workspace.timezone` field access — Mongoose schema defaults don't apply
 * to `.lean()` reads of documents that predate the field (this codebase's
 * dominant read pattern), so a pre-existing workspace with no `timezone` key
 * at all would otherwise resolve to `undefined`.
 */
export function getWorkspaceTimezone(workspaceDocOrLean) {
  const tz = workspaceDocOrLean?.timezone;
  if (tz && DateTime.local().setZone(tz).isValid) return tz;
  return DEFAULT_WORKSPACE_TIMEZONE;
}

/** Current instant, expressed in the workspace's configured zone. */
export function nowInWorkspaceTz(timezone) {
  return DateTime.utc().setZone(timezone);
}

/** 'YYYY-MM' accrual-period key for `date` as it falls in `timezone`. */
export function getPeriodKey(date, timezone) {
  return DateTime.fromJSDate(date instanceof Date ? date : new Date(date), { zone: 'utc' })
    .setZone(timezone)
    .toFormat('yyyy-MM');
}

/** This calendar month's period key, in the workspace's zone, right now. */
export function getCurrentPeriodKey(timezone) {
  return nowInWorkspaceTz(timezone).toFormat('yyyy-MM');
}

/** Shift a 'YYYY-MM' period string by `n` months (may be negative). */
export function shiftPeriodKey(period, n) {
  return DateTime.fromFormat(period, 'yyyy-MM', { zone: 'utc' }).plus({ months: n }).toFormat('yyyy-MM');
}

/**
 * [start, end) UTC instants for a 'YYYY-MM' period as it falls in
 * `timezone` — `start` is the first instant of that local month, `end` is
 * the first instant of the following local month (exclusive upper bound).
 */
export function getPeriodBounds(period, timezone) {
  const start = DateTime.fromFormat(period, 'yyyy-MM', { zone: timezone }).startOf('month');
  return { start: start.toUTC().toJSDate(), end: start.plus({ months: 1 }).toUTC().toJSDate() };
}

/**
 * A calendar day, identified by its (year, month, day) in `timezone`,
 * represented as the UTC instant of that day's local midnight. Every model
 * that stores a business date (LeaveRequestDay.date, Holiday.date) must be
 * constructed through this function so date-equality queries work
 * regardless of what wall-clock time a date happened to be submitted at.
 */
export function dateOnlyToInstant(dateLike, timezone) {
  const source = dateLike instanceof Date ? DateTime.fromJSDate(dateLike, { zone: 'utc' }).setZone(timezone) : DateTime.fromISO(String(dateLike), { zone: timezone });
  return source.startOf('day').toUTC().toJSDate();
}

/** Yields one date-only instant per calendar day from startDate to endDate (inclusive), in `timezone`. */
export function* eachCalendarDate(startDate, endDate, timezone) {
  let cursor = dateOnlyToInstant(startDate, timezone);
  const end = dateOnlyToInstant(endDate, timezone).getTime();
  while (cursor.getTime() <= end) {
    yield cursor;
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
}

/** Inverse of dateOnlyToInstant — 'yyyy-MM-dd' key for a stored instant. */
export function instantToDateOnlyKey(date, timezone) {
  return DateTime.fromJSDate(date instanceof Date ? date : new Date(date), { zone: 'utc' })
    .setZone(timezone)
    .toFormat('yyyy-MM-dd');
}

/** getDay()-compatible day-of-week (0=Sunday) for a stored date-only instant, in `timezone`. */
export function dayOfWeekInTz(date, timezone) {
  // Luxon's weekday is 1(Mon)-7(Sun); convert to JS Date#getDay()'s 0(Sun)-6(Sat)
  // convention since WorkCalendar.weeklyPattern is defined against that.
  const luxonWeekday = DateTime.fromJSDate(date instanceof Date ? date : new Date(date), { zone: 'utc' })
    .setZone(timezone)
    .weekday;
  return luxonWeekday % 7;
}

/**
 * Resolve an expiry instant for a bucket credited at `creditedAt`, per the
 * policy's expiryRule, evaluated in `timezone`. Returns null for
 * mode 'NEVER'.
 */
export function computeExpiryDate(creditedAt, expiryRule, timezone) {
  const mode = expiryRule?.mode || 'NEVER';
  if (mode === 'NEVER') return null;

  const credited = DateTime.fromJSDate(creditedAt instanceof Date ? creditedAt : new Date(creditedAt), { zone: 'utc' }).setZone(timezone);

  if (mode === 'FIXED_MONTHS_AFTER_CREDIT') {
    const months = Number(expiryRule.months) > 0 ? Number(expiryRule.months) : 1;
    return credited.plus({ months }).toUTC().toJSDate();
  }
  if (mode === 'CALENDAR_YEAR_END') {
    return credited.endOf('year').toUTC().toJSDate();
  }
  if (mode === 'FISCAL_YEAR_END') {
    // FlowTask has no separate fiscal-year-start config today — treat
    // fiscal year as calendar year (Jan-Dec) until a workspace-level fiscal
    // start month is introduced; documented here rather than silently
    // guessed, since a wrong assumption here directly costs an employee
    // their balance.
    return credited.endOf('year').toUTC().toJSDate();
  }
  return null;
}
