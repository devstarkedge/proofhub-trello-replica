import Workspace from '../../models/Workspace.js';
import { getWorkspaceTimezone, instantToDateOnlyKey, eachCalendarDate } from './leaveTimezone.util.js';
import { buildCalendarContext, classifyDateWithContext } from './leaveCalendar.service.js';

/**
 * Cross-module batch helpers built on the single centralized classifier
 * (leaveCalendar.service.js) — this is what any module OTHER than the
 * Leave module itself (Teams/productivity, reports) should call rather
 * than re-deriving working-day logic. Every function here takes a bare
 * `workspaceId` and resolves its own timezone, mirroring
 * leaveDayStatus.service.js's existing convention (that file, not
 * leaveCalendar.service.js's ALS-only convention, is the precedent for
 * "called from outside the Leave module").
 *
 * Each function does exactly one buildCalendarContext call plus one
 * in-memory eachCalendarDate loop — never one query per day.
 */

async function resolveTimezone(workspaceId) {
  const workspace = await Workspace.findById(workspaceId).select('timezone').lean();
  return getWorkspaceTimezone(workspace);
}

/** One date, fully resolved — the shape the spec calls resolveWorkspaceDay(workspaceId, date). */
export async function resolveWorkspaceDay({ workspaceId, date, departmentId = null, timezone = null }) {
  const tz = timezone || await resolveTimezone(workspaceId);
  const context = await buildCalendarContext({ timezone: tz, departmentIds: departmentId ? [departmentId] : [] });
  const result = classifyDateWithContext(context, date, departmentId);
  return {
    date: instantToDateOnlyKey(date, tz),
    workspaceId: String(workspaceId),
    timezone: tz,
    ...result
  };
}

/** Internal shared range-classifier — every batch helper below is a thin projection of this. */
async function classifyRange({ workspaceId, startDate, endDate, departmentId = null, timezone = null }) {
  const tz = timezone || await resolveTimezone(workspaceId);
  const context = await buildCalendarContext({ timezone: tz, departmentIds: departmentId ? [departmentId] : [] });
  const days = [];
  for (const date of eachCalendarDate(startDate, endDate, tz)) {
    days.push({ dateKey: instantToDateOnlyKey(date, tz), ...classifyDateWithContext(context, date, departmentId) });
  }
  return days;
}

/** Date keys ('YYYY-MM-DD', workspace tz) for every working day (full or half) in [startDate, endDate]. */
export async function getWorkingDays({ workspaceId, startDate, endDate, departmentId = null, timezone = null }) {
  const days = await classifyRange({ workspaceId, startDate, endDate, departmentId, timezone });
  return days.filter((d) => d.isWorkingDay).map((d) => d.dateKey);
}

/** Count of working days in [startDate, endDate] — half-working days still count as one working day (they just contribute fewer expected minutes; see getExpectedMinutesForRange). */
export async function countWorkingDays({ workspaceId, startDate, endDate, departmentId = null, timezone = null }) {
  const days = await classifyRange({ workspaceId, startDate, endDate, departmentId, timezone });
  return days.filter((d) => d.isWorkingDay).length;
}

export async function isWorkspaceWorkingDay({ workspaceId, date, departmentId = null, timezone = null }) {
  const result = await resolveWorkspaceDay({ workspaceId, date, departmentId, timezone });
  return result.isWorkingDay;
}

/** Sum of expectedMinutes (0 on a non-working day, half on a half-working day) across [startDate, endDate] — what "expected hours" math (Teams/productivity/reports) should sum instead of `standardMinutes * calendarDayCount`. */
export async function getExpectedMinutesForRange({ workspaceId, startDate, endDate, departmentId = null, timezone = null }) {
  const days = await classifyRange({ workspaceId, startDate, endDate, departmentId, timezone });
  return days.reduce((sum, d) => sum + d.expectedMinutes, 0);
}

/**
 * The multi-user version of getExpectedMinutesForRange/getWorkingDays —
 * for a Teams-page-style roster, builds exactly ONE calendar context
 * covering every distinct department present (not one per user), then
 * classifies every user's date range against it in memory. Returns a
 * Map<userId, { totalExpectedMinutes, workingDayCount, dailyBreakdown }>,
 * where dailyBreakdown is `[{ dateKey, expectedMinutes, isWorkingDay, dayType }]`.
 */
export async function getExpectedMinutesByUser({ workspaceId, users, startDate, endDate, timezone = null }) {
  const tz = timezone || await resolveTimezone(workspaceId);
  const departmentIds = Array.from(new Set(users.map((u) => u.departmentId).filter(Boolean).map(String)));
  const context = await buildCalendarContext({ timezone: tz, departmentIds });

  const result = new Map();
  for (const { userId, departmentId } of users) {
    const dailyBreakdown = [];
    let totalExpectedMinutes = 0;
    let workingDayCount = 0;
    for (const date of eachCalendarDate(startDate, endDate, tz)) {
      const classified = classifyDateWithContext(context, date, departmentId);
      dailyBreakdown.push({
        dateKey: instantToDateOnlyKey(date, tz), expectedMinutes: classified.expectedMinutes,
        isWorkingDay: classified.isWorkingDay, dayType: classified.dayType
      });
      totalExpectedMinutes += classified.expectedMinutes;
      if (classified.isWorkingDay) workingDayCount++;
    }
    result.set(String(userId), { totalExpectedMinutes, workingDayCount, dailyBreakdown });
  }
  return result;
}
