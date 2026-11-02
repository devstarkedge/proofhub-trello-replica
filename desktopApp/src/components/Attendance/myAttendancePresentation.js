import { resolveDisplayStatus } from '../../utils/attendanceStatus';

export const PERSONAL_DAY_STYLES = {
  PRESENT: { label: 'Present', short: 'P', color: 'var(--color-success-text)', background: 'var(--color-success-subtle)' },
  HALF_PRESENT: { label: 'Half day', short: 'H', color: 'var(--color-warning-text)', background: 'var(--color-warning-subtle)' },
  ABSENT: { label: 'Absent', short: 'A', color: 'var(--color-error-text)', background: 'var(--color-error-subtle)' },
  ON_LEAVE: { label: 'On leave', short: 'L', color: 'var(--color-info-text)', background: 'var(--color-info-subtle)' },
  MISSING_CHECKOUT: { label: 'Missing checkout', short: '!', color: 'var(--color-warning-text)', background: 'var(--color-warning-subtle)' },
  HOLIDAY: { label: 'Holiday', short: '•', color: 'var(--color-text-secondary)', background: 'var(--color-bg-muted)' },
  WEEKLY_OFF: { label: 'Non-working day', short: '•', color: 'var(--color-text-secondary)', background: 'var(--color-bg-muted)' },
  LATE: { label: 'Late', short: 'Lt', color: 'var(--color-warning-text)', background: 'var(--color-warning-subtle)' },
  NOT_STARTED: { label: 'Not started', short: '–', color: 'var(--color-text-muted)', background: 'var(--color-bg-muted)' },
  UNKNOWN: { label: 'No record', short: '', color: 'var(--color-text-muted)', background: 'transparent' }
};

export const personalDayStatus = day => day ? resolveDisplayStatus(day) : 'UNKNOWN';
export const personalDayStyle = day => PERSONAL_DAY_STYLES[personalDayStatus(day)] || PERSONAL_DAY_STYLES.UNKNOWN;

export function attendanceMonthRange(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const date = new Date(`${month}-01T12:00:00Z`);
  if (!Number.isFinite(+date)) return null;
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return { startDate: `${month}-01`, endDate: date.toISOString().slice(0, 10) };
}

export function moveAttendanceMonth(month, offset) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export function attendanceDateLabel(key, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`));
}

export function attendanceTimeLabel(instant, timezone) {
  if (!instant) return '—';
  const date = new Date(instant);
  return Number.isFinite(+date) ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(date) : 'Unavailable';
}

// These are views of API-returned days, not a second attendance calculator.
// Today's existing authoritative response supplies its current status; no
// missing date is assigned a presence, leave or working-day classification.
export function personalAttendanceDays(records, today, month) {
  const dates = new Map();
  for (const record of records) {
    if (record.workDateKey?.startsWith(`${month}-`) && !dates.has(record.workDateKey)) dates.set(record.workDateKey, record);
  }
  if (today?.workDateKey?.startsWith(`${month}-`)) dates.set(today.workDateKey, { ...dates.get(today.workDateKey), ...today, currentStatus: true });
  return [...dates.values()].sort((a, b) => b.workDateKey.localeCompare(a.workDateKey));
}

export function personalAttendanceCounts(days) {
  const counts = { present: 0, halfDays: 0, absent: 0, leave: 0 };
  for (const day of days) {
    const status = personalDayStatus(day);
    if (status === 'PRESENT' || status === 'LATE') counts.present++;
    if (status === 'HALF_PRESENT') counts.halfDays++;
    if (status === 'ABSENT') counts.absent++;
    if (status === 'ON_LEAVE') counts.leave++;
  }
  return counts;
}
