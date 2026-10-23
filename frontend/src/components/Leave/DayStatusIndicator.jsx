

import { CalendarCheck2 } from 'lucide-react';

/**
 * Shared by LeaveCalendarGrid and the Teams/TeamLoggedTimeView overlay —
 * one place decides how a day-status value (from
 * GET /api/leave/dashboard/day-status) renders as a small indicator.
 */
const CONFIG = {
  ON_LEAVE: { color: 'var(--color-warning)', bg: 'var(--color-warning-subtle)' },
  HOLIDAY: { color: 'var(--color-info)', bg: 'var(--color-info-subtle)' },
  WEEKLY_OFF: { color: 'var(--color-text-muted)', bg: 'var(--color-bg-muted)' },
  WORKING_DAY: null // no indicator — the default, uncluttered case
};

const LABELS = {
  FULL_DAY: 'Full Day Leave',
  HALF_DAY_FIRST_HALF: 'Half Day (AM)',
  HALF_DAY_SECOND_HALF: 'Half Day (PM)',
  SHORT_LEAVE: 'Short Leave'
};

const DayStatusIndicator = ({ dayStatus, size = 'sm', showCode = false }) => {
  if (!dayStatus) return null;
  const config = CONFIG[dayStatus.status];
  if (!config) return null;

  const dimension = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';
  const title = dayStatus.status === 'ON_LEAVE'
    ? `${LABELS[dayStatus.dayType] || 'Leave'}${dayStatus.leaveTypeName ? ` — ${dayStatus.leaveTypeName}` : ''}`
    : dayStatus.status.replace('_', ' ');

  if (showCode && dayStatus.status === 'ON_LEAVE' && ['APPROVED', 'CANCELLATION_REQUESTED'].includes(dayStatus.requestStatus)) {
    const code = dayStatus.leaveCode || (dayStatus.dayType === 'SHORT_LEAVE' ? 'SL' : dayStatus.dayType?.startsWith('HALF_DAY') ? 'HL' : 'FL');
    const accent = dayStatus.leaveTypeColor || 'var(--color-primary-600)';
    return <span className="inline-flex min-w-[3.25rem] items-center justify-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-bold leading-4 shadow-xs"
      style={{ color: accent, borderColor: `color-mix(in srgb, ${accent} 24%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${accent} 10%, var(--color-card-bg))` }} title={title} aria-label={title}>
      <CalendarCheck2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />{code}</span>;
  }

  return (
    <span
      className={`inline-block rounded-full ${dimension}`}
      style={{ backgroundColor: config.color }}
      title={title}
    />
  );
};

export default DayStatusIndicator;
