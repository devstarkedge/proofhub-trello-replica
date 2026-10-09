import React from 'react';
import { Calendar, X } from 'lucide-react';
import LeaveStatusBadge from './LeaveStatusBadge';
import LeaveEmptyState from './LeaveEmptyState';
import { formatHours } from '../../utils/duration';

const CANCELLABLE_STATUSES = ['PENDING_APPROVAL', 'PARTIALLY_APPROVED'];


const LeaveRequestList = ({
  requests = [],
  onCancel,
  onSelect,
  showRequester = false,
  timezone = 'Asia/Kolkata',
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
              {showRequester && request.requester?.avatar ? <img src={request.requester.avatar} alt="" className="h-9 w-9 rounded-lg object-cover" /> : <Calendar className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                {request.leaveType?.name || 'Leave'}
                {showRequester && request.requester?.name ? ` — ${request.requester.name}` : ''}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {request.startDateKey || new Date(request.startDate).toLocaleDateString(undefined, { timeZone: timezone })}{request.startDate !== request.endDate ? ` – ${request.endDateKey || new Date(request.endDate).toLocaleDateString(undefined, { timeZone: timezone })}` : ''}
                {' · '}{request.totalRequestedDayUnits ?? request.totalConsumingDayUnits} {request.leaveType?.category === 'SHORT_LEAVE' ? 'short leave(s)' : 'day(s)'}
              </p>
              {request.requesterDepartmentIds?.some((d) => d.name) && <p className="text-xs">{request.requesterDepartmentIds.map((d) => d.name).filter(Boolean).join(', ')}</p>}
              {showRequester && (request.requester?.designation || request.requester?.employeeId) && <p className="text-xs">{[request.requester.designation, request.requester.employeeId].filter(Boolean).join(' · ')}</p>}
              {request.days?.length > 0 && <p className="text-xs">{[...new Set(request.days.map((d) => ({ FULL_DAY: 'Full day', HALF_DAY_FIRST_HALF: 'Half day (AM)', HALF_DAY_SECOND_HALF: 'Half day (PM)', SHORT_LEAVE: 'Short leave' })[d.dayType]))].join(', ')}</p>}
              {request.days?.some((d) => d.dayType === 'SHORT_LEAVE') && <p className="text-xs">{request.days.filter((d) => d.dayType === 'SHORT_LEAVE').map((d) => `${d.shortLeaveStartTime}–${d.shortLeaveEndTime} · ${formatHours(d.shortLeaveDurationMinutes)}`).join(', ')}</p>}
              {request.createdAt && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Requested {new Date(request.createdAt).toLocaleDateString(undefined, { timeZone: timezone })}</p>}
            </div>
          </div>

          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
            <LeaveStatusBadge status={request.status} />
            {onSelect && <button type="button" className="text-xs underline" onClick={(e) => { e.stopPropagation(); onSelect(request); }}>View Details</button>}
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
