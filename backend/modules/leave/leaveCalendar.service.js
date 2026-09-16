import Holiday from './holiday.model.js';
import WorkCalendar from './workCalendar.model.js';
import { dateOnlyToInstant, instantToDateOnlyKey, dayOfWeekInTz } from './leaveTimezone.util.js';

// Bootstrap-only fallback for a workspace that enabled the Leave module but
// has not yet configured any WorkCalendar row — never used once a workspace
// scope calendar exists (leaveSetup.service.js always creates one). Kept
// here, not as the schema default alone, so classifyDate never silently
// treats every day as a working day for a not-yet-configured workspace.
const BOOTSTRAP_WEEKLY_PATTERN = new Map(
  [0, 1, 2, 3, 4, 5, 6].map((d) => [d, { isWorkingDay: d >= 1 && d <= 5, isHalfWorkingDay: false }])
);

/**
 * Pre-fetches every Holiday/WorkCalendar row relevant to a workspace once,
 * so classifying many (user, date) pairs — a request's date range, a
 * month's worth of Teams-grid cells, a report — never re-queries per cell.
 * Single-date callers should use `classifyDate` below instead.
 */
export async function buildCalendarContext({ timezone, departmentIds = [] }) {
  const uniqueDepartmentIds = Array.from(new Set((departmentIds || []).filter(Boolean).map(String)));

  const [holidays, workspaceCalendars, departmentCalendars] = await Promise.all([
    Holiday.find({}).lean(),
    WorkCalendar.find({ scope: 'workspace', isActive: true }).sort({ effectiveFrom: -1 }).lean(),
    uniqueDepartmentIds.length
      ? WorkCalendar.find({ scope: 'department', departmentId: { $in: uniqueDepartmentIds }, isActive: true })
          .sort({ effectiveFrom: -1 })
          .lean()
      : Promise.resolve([])
  ]);

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

  return { timezone, holidaysByDateKey, workspaceCalendars, departmentCalendars };
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

/**
 * Classify one date using a pre-built context (see buildCalendarContext).
 * Returns { classification: 'WORKING_DAY'|'HOLIDAY'|'WEEKLY_OFF',
 *           isCalendarHalfWorkingDay, holidayName }.
 *
 * Precedence: a Holiday entry always wins over the weekly pattern
 * (SPECIAL_WORKING_DAY turns an otherwise-off day into a working day —
 * compensatory workdays — HOLIDAY turns an otherwise-working day off).
 * Absent a holiday, the weekly pattern applies: department override first,
 * then the workspace default, then the bootstrap fallback.
 */
export function classifyDateWithContext(context, date, departmentId = null) {
  const dateKey = instantToDateOnlyKey(date, context.timezone);
  const dayStart = dateOnlyToInstant(dateKey, context.timezone);
  const dayOfWeek = dayOfWeekInTz(dayStart, context.timezone);

  const holiday = pickHoliday(context, dateKey, departmentId);
  if (holiday) {
    return {
      classification: holiday.type === 'SPECIAL_WORKING_DAY' ? 'WORKING_DAY' : 'HOLIDAY',
      isCalendarHalfWorkingDay: Boolean(holiday.isHalfDay),
      holidayName: holiday.name
    };
  }

  const departmentCalendar = departmentId
    ? context.departmentCalendars.filter((c) => String(c.departmentId) === String(departmentId))
    : [];
  const calendar =
    pickEffectiveCalendar(departmentCalendar, dayStart.getTime()) ||
    pickEffectiveCalendar(context.workspaceCalendars, dayStart.getTime());

  const patternDay = calendar
    ? calendar.weeklyPattern.find((p) => p.dayOfWeek === dayOfWeek)
    : BOOTSTRAP_WEEKLY_PATTERN.get(dayOfWeek);

  if (!patternDay || patternDay.isWorkingDay) {
    return {
      classification: 'WORKING_DAY',
      isCalendarHalfWorkingDay: Boolean(patternDay?.isHalfWorkingDay),
      holidayName: null
    };
  }
  return { classification: 'WEEKLY_OFF', isCalendarHalfWorkingDay: false, holidayName: null };
}

/** Single-date convenience wrapper — builds a one-shot context. Prefer
 * buildCalendarContext + classifyDateWithContext for anything classifying
 * more than a handful of dates. */
export async function classifyDate({ timezone, date, departmentId = null }) {
  const context = await buildCalendarContext({ timezone, departmentIds: departmentId ? [departmentId] : [] });
  return classifyDateWithContext(context, date, departmentId);
}
