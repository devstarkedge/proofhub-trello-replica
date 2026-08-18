import React from 'react';

const STATUS_STYLES = {
  active: { bg: 'rgba(16, 185, 129, 0.12)', color: '#10b981', label: 'Active' },
  suspended: { bg: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', label: 'Suspended' },
  archived: { bg: 'rgba(107, 114, 128, 0.15)', color: '#6b7280', label: 'Archived' }
};

const WorkspaceStatusBadge = ({ status, className = '' }) => {
  const style = STATUS_STYLES[status] || STATUS_STYLES.active;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${className}`}
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      {style.label}
    </span>
  );
};

export default WorkspaceStatusBadge;
