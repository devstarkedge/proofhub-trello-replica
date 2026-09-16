import React from 'react';
import { Calendar, X } from 'lucide-react';
import LeaveStatusBadge from './LeaveStatusBadge';
import LeaveEmptyState from './LeaveEmptyState';

const CANCELLABLE_STATUSES = ['PENDING_APPROVAL', 'PARTIALLY_APPROVED'];

const formatDate = (value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const LeaveRequestList = ({
  requests = [],
  onCancel,
  onSelect,
  showRequester = false,
  emptyTitle = 'No leave requests to show',
  emptyDescription = 'Requests will appear here when they are created.'
}) => {
  if (!requests.length) {
    return <LeaveEmptyState icon={Calendar} title={emptyTitle} description={emptyDescription} compact />;
  }

  return (
    <div className="space-y-2">
      {requests.map((request) => (
        <div
          key={request._id}
          onClick={() => onSelect?.(request)}
          className="flex cursor-pointer flex-col gap-3 rounded-xl border p-3.5 text-left transition-all hover:-translate-y-px hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
          style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--color-bg-muted)' }}
            >
              <Calendar className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                {request.leaveType?.name || 'Leave'}
                {showRequester && request.requester?.name ? ` — ${request.requester.name}` : ''}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {formatDate(request.startDate)}{request.startDate !== request.endDate ? ` – ${formatDate(request.endDate)}` : ''}
                {' · '}{request.totalConsumingDayUnits} day(s)
              </p>
            </div>
          </div>

          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
            <LeaveStatusBadge status={request.status} />
            {onCancel && CANCELLABLE_STATUSES.includes(request.status) && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onCancel(request); }}
                className="p-1.5 rounded-md hover:bg-[var(--color-bg-muted)]"
                title="Cancel request"
              >
                <X className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default LeaveRequestList;
