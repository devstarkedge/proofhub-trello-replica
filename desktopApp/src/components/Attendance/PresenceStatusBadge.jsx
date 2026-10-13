import React from 'react';
import { resolveDisplayStatus } from '../../utils/attendanceStatus';

// AttendanceDay.presenceState + a couple of derived display-only labels
// (ON_LEAVE, HOLIDAY, WEEKLY_OFF) computed from the multi-dimensional
// result the backend's resolveAttendanceStatus returns — this component
// never re-derives status, it only picks which single label best
// represents an already-resolved combination (see utils/attendanceStatus.js).
const STYLES = {
  PRESENT: { label: 'Present', color: 'var(--color-success-text)', backgroundColor: 'var(--color-success-subtle)' },
  HALF_PRESENT: { label: 'Half Day', color: 'var(--color-warning-text)', backgroundColor: 'var(--color-warning-subtle)' },
  ABSENT: { label: 'Absent', color: 'var(--color-error-text)', backgroundColor: 'var(--color-error-subtle)' },
  MISSING_CHECKOUT: { label: 'Missing Check-Out', color: 'var(--color-error-text)', backgroundColor: 'var(--color-error-subtle)' },
  NOT_STARTED: { label: 'Not Started', color: 'var(--color-text-muted)', backgroundColor: 'var(--color-bg-muted)' },
  ON_LEAVE: { label: 'On Leave', color: 'var(--color-info-text)', backgroundColor: 'var(--color-info-subtle)' },
  HOLIDAY: { label: 'Holiday', color: 'var(--color-info-text)', backgroundColor: 'var(--color-info-subtle)' },
  WEEKLY_OFF: { label: 'Weekly Off', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-bg-muted)' },
  LATE: { label: 'Late', color: 'var(--color-warning-text)', backgroundColor: 'var(--color-warning-subtle)' }
};

const PresenceStatusBadge = ({ day, status }) => {
  const key = status || resolveDisplayStatus(day);
  const style = STYLES[key] || STYLES.NOT_STARTED;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ color: style.color, backgroundColor: style.backgroundColor }}
    >
      {style.label}
    </span>
  );
};

export default PresenceStatusBadge;
