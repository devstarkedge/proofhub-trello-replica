import React from 'react';

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

const DayStatusIndicator = ({ dayStatus, size = 'sm' }) => {
  if (!dayStatus) return null;
  const config = CONFIG[dayStatus.status];
  if (!config) return null;

  const dimension = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';
  const title = dayStatus.status === 'ON_LEAVE'
    ? `${LABELS[dayStatus.dayType] || 'Leave'}${dayStatus.leaveTypeName ? ` — ${dayStatus.leaveTypeName}` : ''}`
    : dayStatus.status.replace('_', ' ');

  return (
    <span
      className={`inline-block rounded-full ${dimension}`}
      style={{ backgroundColor: config.color }}
      title={title}
    />
  );
};

export default DayStatusIndicator;
