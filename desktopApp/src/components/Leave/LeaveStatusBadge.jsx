import React, { memo } from 'react';

// Backed by the semantic theme tokens (--color-success/warning/error/info),
// not hardcoded hex — the CSS variable itself is redefined per light/dark
// theme in theme/tokens.css, so this adapts automatically without needing
// separate dark: Tailwind classes.
const STATUS_STYLES = {
  DRAFT: { token: 'text', label: 'Draft' },
  SUBMITTED: { token: 'info', label: 'Submitted' },
  PENDING_APPROVAL: { token: 'warning', label: 'Pending Approval' },
  PARTIALLY_APPROVED: { token: 'info', label: 'Partially Approved' },
  APPROVED: { token: 'success', label: 'Approved' },
  REJECTED: { token: 'error', label: 'Rejected' },
  CANCELLED_BY_REQUESTER: { token: 'text', label: 'Cancelled' },
  CANCELLATION_REQUESTED: { token: 'warning', label: 'Cancellation Requested' },
  CANCELLED_BY_HR: { token: 'text', label: 'Cancelled by HR' },
  CANCELLED_BY_ADMIN: { token: 'text', label: 'Cancelled by Admin' },
  EXPIRED: { token: 'text', label: 'Expired' }
};

const tokenStyle = (token) => {
  if (token === 'text') {
    return { background: 'var(--color-bg-muted)', color: 'var(--color-text-secondary)' };
  }
  return { background: `var(--color-${token}-subtle)`, color: `var(--color-${token}-text)` };
};

const LeaveStatusBadge = memo(({ status, className = '' }) => {
  const config = STATUS_STYLES[status] || { token: 'text', label: status || 'Unknown' };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${className}`}
      style={tokenStyle(config.token)}
    >
      {config.label}
    </span>
  );
});

LeaveStatusBadge.displayName = 'LeaveStatusBadge';

export default LeaveStatusBadge;
