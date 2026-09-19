import Holiday from './holiday.model.js';
import WorkCalendar from './workCalendar.model.js';
import WorkCalendarRule from './workCalendarRule.model.js';
import WorkCalendarDateOverride from './workCalendarDateOverride.model.js';
import { dateOnlyToInstant, instantToDateOnlyKey, dayOfWeekInTz, occurrenceOf, getStandardWorkMinutes } from './leaveTimezone.util.js';

// Bootstrap-only fallback for a workspace that enabled the Leave module but
// has not yet configured any WorkCalendar row — never used once a workspace
// scope calendar exists (leaveSetup.service.js always creates one). Kept
// here, not as the schema default alone, so classifyDate never silently
// treats every day as a working day for a not-yet-configured workspace.
const BOOTSTRAP_WEEKLY_PATTERN = new Map(
  [0, 1, 2, 3, 4, 5, 6].map((d) => [d, { isWorkingDay: d >= 1 && d <= 5, isHalfWorkingDay: false }])
);

/**
 * Turns raw Holiday/WorkCalendar/WorkCalendarRule/WorkCalendarDateOverride
 * rows into the Map-indexed shape classifyDateWithContext reads. Exists as
 * its own function so a DRAFT (unsaved) configuration — the Work Calendar
 * Settings live preview — can be classified through the exact same
 * precedence/nth-weekday logic as a real save, by passing draft rows here
 * instead of `buildCalendarContext`'s DB-backed rows. This is the only
 * "rows -> context" transformation in the codebase; the preview endpoint
 * must never grow a second one.
 */
export function buildContextFromRows({ timezone, holidays = [], workspaceCalendars = [], departmentCalendars = [], recurringRules = [], dateOverrides = [] }) {
  const holidaysByDateKey = new Map();
  for (const holiday of holidays) {
    const dateKey = instantToDateOnlyKey(holiday.date, timezone);
    const monthDayKey = dateKey.slice(5); // 'MM-dd', for ANNUAL_SAME_DATE matching
    const bucket = holidaysByDateKey.get(dateKey) || [];
    bucket.push(holiday);
    holidaysByDateKey.set(dateKey, bucket);
    if (holiday.recurrenceRule === 'ANNUAL_SAME_DATE') {
      const recurringKey = `*-${monthDayKey}`;
      const recurringBucket = holidaysByDateKey.get(recurringKey) || [];
      recurringBucket.push(holiday);
      holidaysByDateKey.set(recurringKey, recurringBucket);
    }
  }

  const rulesByDayOfWeek = new Map();
  for (const rule of recurringRules) {
    const bucket = rulesByDayOfWeek.get(rule.dayOfWeek) || [];
    bucket.push(rule);
    rulesByDayOfWeek.set(rule.dayOfWeek, bucket);
  }

  const overridesByDateKey = new Map();
  for (const override of dateOverrides) {
    overridesByDateKey.set(instantToDateOnlyKey(override.date, timezone), override);
  }

  return { timezone, holidaysByDateKey, workspaceCalendars, departmentCalendars, rulesByDayOfWeek, overridesByDateKey };
}

/**
 * Pre-fetches every Holiday/WorkCalendar/WorkCalendarRule/
 * WorkCalendarDateOverride row relevant to a workspace once, so
 * classifying many (user, date) pairs — a request's date range, a month's
 * worth of Teams-grid cells, a report — never re-queries per cell.
 * Single-date callers should use `classifyDate` below instead.
 */
export async function buildCalendarContext({ timezone, departmentIds = [] }) {
  const uniqueDepartmentIds = Array.from(new Set((departmentIds || []).filter(Boolean).map(String)));

  const [holidays, workspaceCalendars, departmentCalendars, recurringRules, dateOverrides] = await Promise.all([
    Holiday.find({}).lean(),
    WorkCalendar.find({ scope: 'workspace', isActive: true }).sort({ effectiveFrom: -1 }).lean(),
    uniqueDepartmentIds.length
      ? WorkCalendar.find({ scope: 'department', departmentId: { $in: uniqueDepartmentIds }, isActive: true })
          .sort({ effectiveFrom: -1 })
          .lean()
      : Promise.resolve([]),
    // Workspace-scoped only (no per-department recurring rules/overrides in
    // this pass — see workCalendarRule.model.js).
    WorkCalendarRule.find({ isActive: true }).lean(),
    WorkCalendarDateOverride.find({}).lean()
  ]);

  return buildContextFromRows({ timezone, holidays, workspaceCalendars, departmentCalendars, recurringRules, dateOverrides });
}

function pickEffectiveCalendar(calendars, dayStartMs) {
  // Pre-sorted effectiveFrom desc — first entry whose window has opened wins.
  return calendars.find((c) => new Date(c.effectiveFrom).getTime() <= dayStartMs) || null;
}

function pickHoliday(context, dateKey, departmentId) {
  const exact = context.holidaysByDateKey.get(dateKey) || [];
  const recurring = context.holidaysByDateKey.get(`*-${dateKey.slice(5)}`) || [];
  const candidates = [...exact, ...recurring];
  if (candidates.length === 0) return null;

  const departmentMatch = departmentId
    ? candidates.find((h) => h.scope === 'department' && (h.departmentIds || []).some((id) => String(id) === String(departmentId)))
    : null;
  const locationMatch = candidates.find((h) => h.scope === 'location');
  const workspaceMatch = candidates.find((h) => h.scope === 'workspace');
  return departmentMatch || locationMatch || workspaceMatch || candidates[0];
}

/** The WorkCalendarRule (if any) matching this date's weekday + nth-occurrence-in-month, FIFTH/LAST disambiguated via occurrenceOf. */
function pickRecurringRule(context, dayStart, dayOfWeek, timezone) {
  const rulesForDay = context.rulesByDayOfWeek.get(dayOfWeek) || [];
  if (!rulesForDay.length) return null;
  const { occurrence, isLast } = occurrenceOf(dayStart, timezone);
  return rulesForDay.find((r) => r.occurrence === occurrence) || (isLast ? rulesForDay.find((r) => r.occurrence === 'LAST') : null) || null;
}

/**
 * Classify one date using a pre-built context (see buildCalendarContext).
 *
 * Returns { classification, dayType, isWorkingDay, isCalendarHalfWorkingDay,
 *           holidayName, expectedMinutes, source, ruleId, holidayId, overrideId }.
 *
 * `classification` ('WORKING_DAY'|'HOLIDAY'|'WEEKLY_OFF') is the original,
 * backward-compatible 3-value result every existing caller (leaveRequest.
 * service.js, leaveDayStatus.service.js) already destructures and keeps
 * working with unchanged. `dayType` is the new, more specific 7-value
 * result: WORKING_DAY | WEEKLY_OFF | RECURRING_OFF | RECURRING_WORKING |
 * SPECIAL_WORKING_DAY | SPECIAL_OFF_DAY | HOLIDAY.
 *
 * Precedence, most specific first — documented once, applied everywhere:
 *   1. Explicit Date Override (WorkCalendarDateOverride) — exact date.
 *   2. Holiday (unchanged: SPECIAL_WORKING_DAY forces working, HOLIDAY
 *      forces off) — exact date, same tier as #1; Override is checked
 *      first so it can correct a mistaken Holiday entry without ever
 *      disturbing Holiday's own precedence over the weekly pattern below.
 *   3. Recurring/nth-weekday Rule (WorkCalendarRule) — this weekday's
 *      occurrence-in-month.
 *   4. Base weekly pattern (WorkCalendar) — department override first,
 *      then the workspace default.
 *   5. Bootstrap fallback (Mon-Fri, pre-setup only).
 */
export function classifyDateWithContext(context, date, departmentId = null) {
  const dateKey = instantToDateOnlyKey(date, context.timezone);
  const dayStart = dateOnlyToInstant(dateKey, context.timezone);
  const dayOfWeek = dayOfWeekInTz(dayStart, context.timezone);

  const departmentCalendar = departmentId
    ? context.departmentCalendars.filter((c) => String(c.departmentId) === String(departmentId))
    : [];
  const calendar =
    pickEffectiveCalendar(departmentCalendar, dayStart.getTime()) ||
    pickEffectiveCalendar(context.workspaceCalendars, dayStart.getTime());
  const standardMinutes = getStandardWorkMinutes(calendar);
  const computeExpectedMinutes = (isWorkingDay, isHalfDay) =>
    !isWorkingDay ? 0 : isHalfDay ? Math.round(standardMinutes / 2) : standardMinutes;

  // 1. Explicit Date Override
  const override = context.overridesByDateKey.get(dateKey);
  if (override) {
    const isWorkingDay = override.type === 'WORKING_OVERRIDE';
    const isHalfDay = isWorkingDay && Boolean(override.isHalfDay);
    return {
      classification: isWorkingDay ? 'WORKING_DAY' : 'HOLIDAY',
      dayType: isWorkingDay ? 'SPECIAL_WORKING_DAY' : 'SPECIAL_OFF_DAY',
      isWorkingDay, isCalendarHalfWorkingDay: isHalfDay, holidayName: null,
      expectedMinutes: computeExpectedMinutes(isWorkingDay, isHalfDay),
      source: 'DATE_OVERRIDE', ruleId: null, holidayId: null, overrideId: override._id
    };
  }

  // 2. Holiday
  const holiday = pickHoliday(context, dateKey, departmentId);
  if (holiday) {
    const isWorkingDay = holiday.type === 'SPECIAL_WORKING_DAY';
    const isHalfDay = Boolean(holiday.isHalfDay);
    return {
      classification: isWorkingDay ? 'WORKING_DAY' : 'HOLIDAY',
      dayType: isWorkingDay ? 'SPECIAL_WORKING_DAY' : 'HOLIDAY',
      isWorkingDay, isCalendarHalfWorkingDay: isHalfDay, holidayName: holiday.name,
      expectedMinutes: computeExpectedMinutes(isWorkingDay, isHalfDay),
      source: 'HOLIDAY', ruleId: null, holidayId: holiday._id, overrideId: null
    };
  }

  // 3. Recurring rule
  const rule = pickRecurringRule(context, dayStart, dayOfWeek, context.timezone);
  if (rule) {
    const isWorkingDay = rule.action === 'WORKING';
    return {
      classification: isWorkingDay ? 'WORKING_DAY' : 'WEEKLY_OFF',
      dayType: isWorkingDay ? 'RECURRING_WORKING' : 'RECURRING_OFF',
      isWorkingDay, isCalendarHalfWorkingDay: false, holidayName: null,
      expectedMinutes: computeExpectedMinutes(isWorkingDay, false),
      source: 'RECURRING_RULE', ruleId: rule._id, holidayId: null, overrideId: null
    };
  }

  // 4/5. Base weekly pattern + bootstrap fallback
  const patternDay = calendar
    ? calendar.weeklyPattern.find((p) => p.dayOfWeek === dayOfWeek)
    : BOOTSTRAP_WEEKLY_PATTERN.get(dayOfWeek);
  const isWorkingDay = !patternDay || patternDay.isWorkingDay;
  const isHalfDay = isWorkingDay && Boolean(patternDay?.isHalfWorkingDay);
  return {
    classification: isWorkingDay ? 'WORKING_DAY' : 'WEEKLY_OFF',
    dayType: isWorkingDay ? 'WORKING_DAY' : 'WEEKLY_OFF',
    isWorkingDay, isCalendarHalfWorkingDay: isHalfDay, holidayName: null,
    expectedMinutes: computeExpectedMinutes(isWorkingDay, isHalfDay),
    source: calendar ? 'BASE_PATTERN' : 'BOOTSTRAP', ruleId: null, holidayId: null, overrideId: null
  };
}

/** Single-date convenience wrapper — builds a one-shot context. Prefer
 * buildCalendarContext + classifyDateWithContext for anything classifying
 * more than a handful of dates. */
export async function classifyDate({ timezone, date, departmentId = null }) {
  const context = await buildCalendarContext({ timezone, departmentIds: departmentId ? [departmentId] : [] });
  return classifyDateWithContext(context, date, departmentId);
}
