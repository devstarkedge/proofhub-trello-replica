import React from 'react';
import { Calendar, CalendarDays, Clock, ChevronRight, X, User } from 'lucide-react';
import LeaveStatusBadge from './LeaveStatusBadge';
import LeaveEmptyState from './LeaveEmptyState';
import { formatHours } from '../../utils/duration';
import { formatFriendlyDateRange, formatFriendlyDate } from '../../utils/leavePresentation';

const CANCELLABLE_STATUSES = ['PENDING_APPROVAL', 'PARTIALLY_APPROVED'];

const DAY_TYPE_MAP = {
  FULL_DAY: 'Full day',
  HALF_DAY_FIRST_HALF: 'Half day (AM)',
  HALF_DAY_SECOND_HALF: 'Half day (PM)',
  SHORT_LEAVE: 'Short leave'
};

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
    <div className="space-y-2.5">
      {requests.map((request) => {
        const departments = request.requesterDepartmentIds?.map((d) => d.name).filter(Boolean).join(', ');
        const dayTypes = request.days?.length > 0
          ? [...new Set(request.days.map((d) => DAY_TYPE_MAP[d.dayType] || d.dayType))].join(', ')
          : null;

        const shortLeaves = request.days?.filter((d) => d.dayType === 'SHORT_LEAVE') || [];

        const dateRangeStr = formatFriendlyDateRange(
          request.startDateKey || request.startDate,
          request.endDateKey || request.endDate,
          timezone
        );

        const durationStr = `${request.totalRequestedDayUnits ?? request.totalConsumingDayUnits ?? 1} ${
          request.leaveType?.category === 'SHORT_LEAVE' ? 'short leave(s)' : 'day(s)'
        }`;

        const createdDateStr = request.createdAt ? formatFriendlyDate(request.createdAt, timezone) : null;
        const needsDecision = Boolean(request.actions?.approvals?.length);

        return (
          <div
            key={request._id}
            onClick={() => onSelect && onSelect(request)}
            className="group relative flex flex-col md:flex-row md:items-center justify-between gap-3.5 rounded-xl border p-4 text-left transition-all duration-200 hover:shadow-sm cursor-pointer hover:border-[var(--color-primary-600)]/40"
            style={{
              backgroundColor: 'var(--color-card-bg)',
              borderColor: 'var(--color-border-subtle)'
            }}
          >
            {/* Left Column: Requester & Leave Core Details */}
            <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
              {/* Avatar or Icon */}
              {showRequester && request.requester?.avatar ? (
                <img
                  src={request.requester.avatar}
                  alt={request.requester.name || ''}
                  className="h-10 w-10 rounded-full object-cover border border-[var(--color-border-subtle)] flex-shrink-0 shadow-2xs"
                />
              ) : showRequester && request.requester?.name ? (
                <div className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white shadow-2xs flex-shrink-0 bg-gradient-to-br from-indigo-500 to-purple-600">
                  {request.requester.name.slice(0, 2).toUpperCase()}
                </div>
              ) : (
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0 shadow-2xs"
                  style={{
                    backgroundColor: 'var(--color-primary-subtle)',
                    color: 'var(--color-primary)'
                  }}
                >
                  <Calendar className="h-5 w-5" />
                </div>
              )}

              {/* Text Info */}
              <div className="min-w-0 flex-1 space-y-1">
                {/* Header Line: Name / Title + Badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors">
                    {showRequester && request.requester?.name ? request.requester.name : (request.leaveType?.name || 'Leave Request')}
                  </h4>

                  {departments && (
                    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)]">
                      {departments}
                    </span>
                  )}

                  {showRequester && request.requester?.designation && (
                    <span className="text-xs text-[var(--color-text-muted)] truncate">
                      · {request.requester.designation}
                    </span>
                  )}
                </div>

                {/* Subtitle Line: Leave Type with color pill + Dates + Duration */}
                <div className="flex items-center gap-2 flex-wrap text-xs text-[var(--color-text-muted)]">
                  {/* Leave Type pill */}
                  <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-subtle)] px-2 py-0.5 rounded-md border border-[var(--color-border-subtle)]">
                    <span
                      className="h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: request.leaveType?.color || '#3b82f6' }}
                    />
                    <span className="truncate">{request.leaveType?.name || 'Leave'}</span>
                  </span>

                  {/* Dates with Calendar icon */}
                  <span className="flex items-center gap-1 font-medium text-[var(--color-text-primary)]">
                    <CalendarDays className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                    <span>{dateRangeStr}</span>
                  </span>

                  {/* Duration */}
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                    ({durationStr})
                  </span>

                  {/* Day Type (e.g. Full day, Half day) */}
                  {dayTypes && (
                    <span className="text-[11px] text-[var(--color-text-muted)] bg-[var(--color-bg-muted)] px-1.5 py-0.5 rounded">
                      {dayTypes}
                    </span>
                  )}
                </div>

                {/* Short leave schedules if present */}
                {shortLeaves.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                    <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>
                      Schedule:{' '}
                      {shortLeaves
                        .map((d) => `${d.shortLeaveStartTime}–${d.shortLeaveEndTime} (${formatHours(d.shortLeaveDurationMinutes)})`)
                        .join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Middle Section: Submission Date & Approval Progress */}
            <div className="flex sm:flex-col items-start sm:items-end justify-between sm:justify-center gap-1 border-t sm:border-t-0 pt-2 sm:pt-0 border-[var(--color-border-subtle)] min-w-[150px] flex-shrink-0">
              {createdDateStr && (
                <span className="text-xs text-[var(--color-text-muted)]">
                  Applied {createdDateStr}
                </span>
              )}

              {request.progress && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {needsDecision && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                      Needs your decision
                    </span>
                  )}
                  <span className="text-xs font-medium text-[var(--color-text-muted)]">
                    Stage {request.progress.approved} of {request.progress.total}
                  </span>
                </div>
              )}
            </div>

            {/* Right Section: Status Badge & Actions */}
            <div className="flex items-center justify-between sm:justify-end gap-2.5 flex-shrink-0">
              <LeaveStatusBadge status={request.status} />

              {onSelect && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(request);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border hover:bg-[var(--color-bg-subtle)] transition-all text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer shadow-2xs group-hover:border-[var(--color-primary-600)]/50"
                  style={{ borderColor: 'var(--color-border-default)' }}
                >
                  <span>View Details</span>
                  <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-muted)] group-hover:text-[var(--color-primary-600)] transition-transform group-hover:translate-x-0.5" />
                </button>
              )}

              {onCancel && CANCELLABLE_STATUSES.includes(request.status) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancel(request);
                  }}
                  className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[var(--color-text-muted)] hover:text-rose-600 transition-colors cursor-pointer"
                  title="Cancel request"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default LeaveRequestList;
