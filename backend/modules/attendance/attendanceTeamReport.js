import { DateTime } from 'luxon';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { validateDateRange } from '../../utils/calendarDateRange.js';

export const TEAM_STATUSES = ['PRESENT', 'HALF_PRESENT', 'ABSENT', 'MISSING_CHECKOUT', 'NOT_STARTED', 'ON_LEAVE', 'HOLIDAY', 'WEEKLY_OFF'];
export const TEAM_WORK_MODES = ['OFFICE', 'WFH', 'HYBRID', 'FIELD'];
export const TEAM_SORTS = ['name', 'email', 'department', 'present', 'halfDays', 'absent', 'missingCheckout', 'attendanceMinutes', 'attendanceRate'];
const identifier = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
export function validateTeamQuery(query, timezone, now = new Date()) {
  const month = DateTime.fromJSDate(now).setZone(timezone);
  const q = { startDate: month.startOf('month').toISODate(), endDate: month.endOf('month').toISODate(),
    status: '', workMode: '', departmentId: '', userId: '', search: '', sort: 'name', direction: 'asc', page: 1, pageSize: 25, ...query };
  for (const key of ['startDate', 'endDate', 'status', 'workMode', 'departmentId', 'userId', 'search', 'sort', 'direction']) {
    if (typeof q[key] !== 'string') throw new ErrorResponse(`Invalid ${key}`, 400);
  }
  validateDateRange(q.startDate, q.endDate);
  for (const key of ['departmentId', 'userId']) if (q[key] && !identifier(q[key])) throw new ErrorResponse(`Invalid ${key}`, 400);
  if (q.status && !TEAM_STATUSES.includes(q.status)) throw new ErrorResponse('Invalid attendance status', 400);
  if (q.workMode && !TEAM_WORK_MODES.includes(q.workMode)) throw new ErrorResponse('Invalid work mode', 400);
  if (!TEAM_SORTS.includes(q.sort) || !['asc', 'desc'].includes(q.direction)) throw new ErrorResponse('Invalid attendance sort', 400);
  q.page = Number(q.page); q.pageSize = Number(q.pageSize); q.search = q.search.trim();
  if (!Number.isSafeInteger(q.page) || q.page < 1 || q.page > 100000 || ![10, 25, 50, 100].includes(q.pageSize) || q.search.length > 120) throw new ErrorResponse('Invalid attendance pagination or search', 400);
  return q;
}

export function attendanceRate({ coveredDates = 0, unresolvedDays = 0, presenceCredit = 0, requiredCredit = 0 }, expectedDates) {
  if (coveredDates !== expectedDates || unresolvedDays) return { value: null, reason: 'Complete historical schedule, eligibility or attendance outcomes are unavailable.', coveredDates, expectedDates };
  if (!requiredCredit) return { value: null, reason: 'No completed attendance obligation in this period.', coveredDates, expectedDates };
  if (presenceCredit < 0 || presenceCredit > requiredCredit || !Number.isFinite(presenceCredit) || !Number.isFinite(requiredCredit)) return { value: null, reason: 'Attendance credit requires review.', coveredDates, expectedDates };
  return { value: Math.round(presenceCredit / requiredCredit * 1000) / 10, reason: null, coveredDates, expectedDates };
}

export function reportStatus(day) {
  if (!day) return 'UNKNOWN';
  if (day.leaveState === 'FULL_LEAVE') return 'ON_LEAVE';
  if (day.calendarDayType === 'HOLIDAY') return 'HOLIDAY';
  if (day.isCalendarWorkingDay === false) return 'WEEKLY_OFF';
  return day.presenceState || 'UNKNOWN';
}

export function csvCell(value) {
  const text = String(value ?? '');
  return '"' + (/^[\s]*[=+@-]/.test(text) ? "'" + text : text).replaceAll('"', '""') + '"';
}
export const csvLine = row => row.map(csvCell).join(',') + '\r\n';

export function serializeTeamRow(row, expectedDates) {
  return { user: row.user, departments: row.departments || [], historical: row.historical,
    recordedDays: row.recordedDays || 0, attendanceDays: row.attendanceDays || 0,
    present: row.present || 0, halfDays: row.halfDays || 0, absent: row.absent || 0,
    missingCheckout: row.missingCheckout || 0, leaveDays: row.leaveDays || 0,
    attendanceMinutes: row.attendanceDays && (row.measuredDays === undefined || row.measuredDays === row.attendanceDays) ? row.attendanceMinutes : null,
    attendanceRate: attendanceRate(row, expectedDates) };
}
