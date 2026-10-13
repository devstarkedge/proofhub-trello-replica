import React from 'react';
import { Inbox } from 'lucide-react';

const LeaveEmptyState = ({
  icon = Inbox,
  title = 'Nothing to show yet',
  description,
  action,
  compact = false
}) => (
  <div
    className={`flex flex-col items-center justify-center rounded-xl border border-dashed px-5 text-center ${compact ? 'py-7' : 'py-10 sm:py-12'}`}
    style={{ backgroundColor: 'var(--color-bg-subtle)', borderColor: 'var(--color-border-default)' }}
  >
    <div
      className="mb-3 flex h-10 w-10 items-center justify-center rounded-full"
      style={{ backgroundColor: 'var(--color-bg-muted)', color: 'var(--color-text-secondary)' }}
    >
      {React.createElement(icon, { className: 'h-5 w-5' })}
    </div>
    <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</p>
    {description && (
      <p className="mt-1 max-w-lg text-xs leading-5 sm:text-sm" style={{ color: 'var(--color-text-muted)' }}>
        {description}
      </p>
    )}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export default LeaveEmptyState;
