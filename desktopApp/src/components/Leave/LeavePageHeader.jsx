import React from 'react';

const LeavePageHeader = ({ title, description, icon: Icon, action }) => (
  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div className="flex min-w-0 items-start gap-3">
      {Icon && (
        <div
          className="mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-xl"
          style={{ backgroundColor: 'var(--color-primary-subtle)', color: 'var(--color-primary-600)' }}
        >
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl" style={{ color: 'var(--color-text-primary)' }}>
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-3xl text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {description}
          </p>
        )}
      </div>
    </div>
    {action && <div className="flex-none">{action}</div>}
  </div>
);

export default LeavePageHeader;
