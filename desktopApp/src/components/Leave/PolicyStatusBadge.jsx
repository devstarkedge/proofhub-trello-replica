import React from 'react';

const STYLES = {
  draft: { label: 'Draft', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-bg-muted)' },
  scheduled: { label: 'Scheduled', color: 'var(--color-info-text)', backgroundColor: 'var(--color-info-subtle)' },
  active: { label: 'Active', color: 'var(--color-success-text)', backgroundColor: 'var(--color-success-subtle)' },
  inactive: { label: 'Inactive', color: 'var(--color-text-muted)', backgroundColor: 'var(--color-bg-muted)' },
  archived: { label: 'Archived', color: 'var(--color-error-text)', backgroundColor: 'var(--color-error-subtle)' }
};

/** DRAFT / SCHEDULED / ACTIVE / INACTIVE / ARCHIVED — the full LeavePolicy.status vocabulary, one look everywhere it's shown. */
const PolicyStatusBadge = ({ status }) => {
  const style = STYLES[status] || STYLES.draft;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ color: style.color, backgroundColor: style.backgroundColor }}
    >
      {style.label}
    </span>
  );
};

export default PolicyStatusBadge;
