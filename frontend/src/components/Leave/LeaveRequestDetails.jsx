import { formatFriendlyDateTime, formatFriendlyDateRange, formatFriendlyDuration } from '../../utils/leavePresentation';
import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Link as LinkIcon,
  Check,
  AlertCircle,
  Clock
} from 'lucide-react';
import { toast } from 'react-toastify';
import * as leaveApi from '../../services/leaveApi';
import LeaveStatusBadge from './LeaveStatusBadge';
import LeaveApprovalTimeline from './LeaveApprovalTimeline';
import useLeaveQuery from '../../hooks/useLeaveQuery';
import { formatHours } from '../../utils/duration';

const LEVEL_LABELS = {
  DEPARTMENT_MANAGER: 'Department Manager',
  HR: 'Human Resources',
  ADMIN: 'Administrator'
};

const DAY_TYPE_LABELS = {
  FULL_DAY: 'Full Day',
  HALF_DAY_FIRST_HALF: 'Half Day (AM)',
  HALF_DAY_SECOND_HALF: 'Half Day (PM)',
  SHORT_LEAVE: 'Short Leave'
};

function getEventDisplayConfig(event, labels) {
  const comment = event.changes?.after?.comment || event.changes?.after?.reason;
  const levelKey = event.changes?.after?.level || event.level;
  const levelName = labels[levelKey] || levelKey || 'Approver';
  const actorName = event.actor?.name;

  switch (event.action) {
    case 'LEAVE_REQUEST_SUBMITTED':
      return {
        title: 'Request Submitted',
        subtitle: actorName ? `by ${actorName}` : null,
        note: null,
        dotColor: 'var(--color-primary)'
      };
    case 'LEAVE_APPROVAL_ASSIGNED':
      return {
        title: `Assigned to ${levelName}`,
        subtitle: null,
        note: null,
        dotColor: 'var(--color-warning)'
      };
    case 'LEAVE_APPROVAL_APPROVED':
      return {
        title: `Approved by ${levelName}`,
        subtitle: actorName ? `by ${actorName}` : null,
        note: comment,
        dotColor: 'var(--color-success)'
      };
    case 'LEAVE_APPROVAL_REJECTED':
      return {
        title: `Rejected by ${levelName}`,
        subtitle: actorName ? `by ${actorName}` : null,
        note: comment,
        dotColor: 'var(--color-error)'
      };
    case 'LEAVE_CANCELLATION_REQUESTED':
      return {
        title: 'Cancellation Requested',
        subtitle: actorName ? `by ${actorName}` : null,
        note: comment,
        dotColor: 'var(--color-warning)'
      };
    case 'LEAVE_CANCELLATION_REJECTED':
      return {
        title: 'Cancellation Declined',
        subtitle: actorName ? `by ${actorName}` : null,
        note: comment,
        dotColor: 'var(--color-error)'
      };
    case 'LEAVE_REQUEST_CANCELLED_BY_REQUESTER':
      return {
        title: 'Cancelled by Applicant',
        subtitle: actorName ? `by ${actorName}` : null,
        note: null,
        dotColor: 'var(--color-text-muted)'
      };
    case 'LEAVE_CANCELLED_BY_HR':
      return {
        title: 'Cancelled by HR',
        subtitle: actorName ? `by ${actorName}` : null,
        note: comment,
        dotColor: 'var(--color-text-muted)'
      };
    case 'LEAVE_CANCELLED_BY_ADMIN':
      return {
        title: 'Cancelled by Admin',
        subtitle: actorName ? `by ${actorName}` : null,
        note: comment,
        dotColor: 'var(--color-text-muted)'
      };
    default:
      return {
        title: event.action.replace(/^LEAVE_/, '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
        subtitle: actorName ? `by ${actorName}` : null,
        note: comment,
        dotColor: 'var(--color-text-muted)'
      };
  }
}

export default function LeaveRequestDetails({ requestId, onClose, onChanged }) {
  const read = useLeaveQuery('request-detail', requestId, leaveApi.getRequestDetail);
  const detail = read.isError ? null : read.data, loading = read.isPending;
  const [actionError, setError] = useState('');
  const error = actionError || read.error?.response?.data?.message || (read.isError ? 'Unable to load request details.' : '');
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [comment, setComment] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const inFlight = useRef(false);
  const panel = useRef(null);

  const load = read.refetch;
  useEffect(() => { if (!detail) { setConfirmation(null); setError(''); } }, [detail]);

  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.querySelector('button')?.focus();
    return () => previous?.focus?.();
  }, []);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/leave?request=${requestId}`);
      setCopiedLink(true);
      toast.success('Request link copied to clipboard');
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setError('Unable to copy link.');
    }
  };

  const choose = (action) => {
    setConfirmation(action);
    setComment('');
    setError('');
  };

  const execute = async (event) => {
    event.preventDefault();
    if (inFlight.current || !confirmation) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const { kind, stageId, decision } = confirmation;
      if (kind === 'approval') await leaveApi.decideApproval(stageId, decision, comment);
      if (kind === 'cancel') await leaveApi.cancelPendingRequest(requestId);
      if (kind === 'requestCancellation') await leaveApi.requestCancellation(requestId, comment);
      if (kind === 'reviewCancellation') await leaveApi.decideCancellationRequest(requestId, decision, comment);
      if (kind === 'cancelApproved') await leaveApi.hrCancelApprovedLeave(requestId, comment);
      setConfirmation(null);
      toast.success('Leave request updated successfully');
      onChanged();
      await load();
    } catch (err) {
      await load();
      setConfirmation(null);
      setError(err.response?.data?.message || 'The action could not be completed.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const trapFocus = (event) => {
    if (event.key === 'Escape' && !busy) onClose();
    if (event.key !== 'Tab') return;
    const elements = [...panel.current.querySelectorAll('button:not(:disabled), textarea, a[href], input')].filter(
      (element) => element.offsetParent !== null
    );
    const first = elements[0],
      last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const request = detail?.request;
  const actions = detail?.actions;
  const timezone = detail?.timezone;

  // Find rejection information
  const rejectedStage = detail?.approvals?.find((a) => a.status === 'REJECTED');

  // Human-friendly sorted history
  const sortedHistory = detail?.history
    ? [...detail.history].sort((a, b) => {
        const timeA = new Date(a.at).getTime();
        const timeB = new Date(b.at).getTime();
        if (timeA !== timeB) return timeA - timeB;
        if (a.action === 'LEAVE_REQUEST_SUBMITTED') return -1;
        if (b.action === 'LEAVE_REQUEST_SUBMITTED') return 1;
        return (a.id || '').localeCompare(b.id || '');
      })
    : [];

  const departmentNames = request?.requesterDepartmentIds?.map((d) => d.name).filter(Boolean).join(', ') || '';

  // Determine compact status subtitle & reason
  let statusMeta = '';
  let statusReason = '';

  if (request) {
    if (request.status === 'REJECTED') {
      const decider = rejectedStage?.decidedBy?.name ? `By ${rejectedStage.decidedBy.name}` : 'By Reviewer';
      const role = rejectedStage?.level ? ` (${LEVEL_LABELS[rejectedStage.level] || rejectedStage.level})` : '';
      const dateStr = formatFriendlyDateTime(rejectedStage?.decidedAt, timezone);
      statusMeta = `${decider}${role}${dateStr ? ` · ${dateStr}` : ''}`;
      statusReason = rejectedStage?.comment || '';
    } else if (request.status === 'APPROVED') {
      statusMeta = 'All stages approved';
    } else if (request.status === 'CANCELLATION_REQUESTED') {
      statusMeta = 'Awaiting review';
      statusReason = request.cancellation?.requestedReason || '';
    } else if (request.status === 'CANCELLED_BY_REQUESTER') {
      statusMeta = 'By applicant';
    } else if (request.status === 'CANCELLED_BY_HR') {
      statusMeta = 'By HR';
      statusReason = request.cancellation?.finalReason || '';
    } else if (request.status === 'CANCELLED_BY_ADMIN') {
      statusMeta = 'By Administrator';
      statusReason = request.cancellation?.finalReason || '';
    } else if (request.status === 'PARTIALLY_APPROVED' || request.status === 'PENDING_APPROVAL') {
      statusMeta = `${request.progress?.approved ?? 0} of ${request.progress?.total ?? 0} stages approved`;
    }
  }

  const hasActions = actions && (
    (actions.approvals?.length > 0) ||
    actions.canCancel ||
    actions.canRequestCancellation ||
    actions.canReviewCancellation ||
    actions.canCancelApproved
  );

  return (
    <div
      className="fixed inset-0 z-[999] flex justify-end bg-black/40 backdrop-blur-[2px] transition-opacity"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-detail-title"
        onKeyDown={trapFocus}
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full max-w-full sm:max-w-[500px] flex-col shadow-xl transition-all"
        style={{ backgroundColor: 'var(--color-bg-base)', color: 'var(--color-text-primary)' }}
      >
        {/* Compact Header */}
        <div
          className="flex h-14 items-center justify-between border-b px-5 flex-shrink-0"
          style={{ borderColor: 'var(--color-border-subtle)', backgroundColor: 'var(--color-card-bg)' }}
        >
          <h2 id="leave-detail-title" className="text-base font-semibold tracking-tight">
            Leave Request Details
          </h2>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-[var(--color-bg-subtle)] transition-colors cursor-pointer"
              style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' }}
              title="Copy request link"
            >
              {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <LinkIcon className="h-3.5 w-3.5" />}
              <span>{copiedLink ? 'Copied' : 'Share Link'}</span>
            </button>
            <button
              type="button"
              aria-label="Close"
              disabled={busy}
              onClick={onClose}
              className="rounded-md p-1 hover:bg-[var(--color-bg-muted)] transition-colors cursor-pointer"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-400"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-xs py-1" style={{ color: 'var(--color-text-muted)' }}>
              <Clock className="h-3.5 w-3.5 animate-spin text-indigo-500" />
              <span>Updating request…</span>
            </div>
          )}

          {request && (
            <>
              {/* 1. Compact Request Status */}
              <div
                className="flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs"
                style={{
                  backgroundColor:
                    request.status === 'REJECTED'
                      ? 'var(--color-error-subtle)'
                      : request.status === 'APPROVED'
                      ? 'var(--color-success-subtle)'
                      : request.status === 'CANCELLATION_REQUESTED' || request.status === 'PENDING_APPROVAL' || request.status === 'PARTIALLY_APPROVED'
                      ? 'var(--color-warning-subtle)'
                      : 'var(--color-bg-subtle)',
                  borderColor: 'var(--color-border-subtle)'
                }}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <LeaveStatusBadge status={request.status} />
                  {statusMeta && (
                    <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                      · {statusMeta}
                    </span>
                  )}
                </div>
                {statusReason && (
                  <p className="mt-0.5 text-xs">
                    <span className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>Reason: </span>
                    <span style={{ color: 'var(--color-text-primary)' }}>{statusReason}</span>
                  </p>
                )}
              </div>

              {/* 2. Compact Employee Info */}
              <div className="flex items-center gap-2.5 pt-0.5">
                {request.requester?.avatar ? (
                  <img
                    src={request.requester.avatar}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover border flex-shrink-0"
                    style={{ borderColor: 'var(--color-border-subtle)' }}
                  />
                ) : (
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold flex-shrink-0"
                    style={{ backgroundColor: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}
                  >
                    {(request.requester?.name || 'E').slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-none truncate" style={{ color: 'var(--color-text-primary)' }}>
                    {request.requester?.name || 'Employee'}
                  </p>
                  <p className="mt-1 text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                    {[departmentNames, request.requester?.designation, request.requester?.email].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>

              {/* 3. Compact Leave Summary */}
              <div className="border-t pt-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'var(--color-text-muted)' }}>
                  Leave Summary
                </h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                  <div>
                    <span style={{ color: 'var(--color-text-muted)' }}>Leave Type</span>
                    <p className="mt-0.5 font-medium flex items-center gap-1.5" style={{ color: 'var(--color-text-primary)' }}>
                      {request.leaveType?.color && (
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: request.leaveType.color }} />
                      )}
                      <span className="truncate">{request.leaveType?.name || 'Leave'}</span>
                    </p>
                  </div>

                  <div>
                    <span style={{ color: 'var(--color-text-muted)' }}>Duration</span>
                    <p className="mt-0.5 font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {formatFriendlyDuration(request.totalRequestedDayUnits, request.leaveType?.category)}
                      {detail.days?.[0]?.dayType && detail.days[0].dayType !== 'FULL_DAY' && (
                        <span className="ml-1 text-[11px] font-normal" style={{ color: 'var(--color-text-muted)' }}>
                          ({DAY_TYPE_LABELS[detail.days[0].dayType] || detail.days[0].dayType})
                        </span>
                      )}
                    </p>
                  </div>

                  <div>
                    <span style={{ color: 'var(--color-text-muted)' }}>Date</span>
                    <p className="mt-0.5 font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {formatFriendlyDateRange(
                        request.startDateKey || request.startDate,
                        request.endDateKey || request.endDate,
                        timezone
                      )}
                    </p>
                  </div>

                  <div>
                    <span style={{ color: 'var(--color-text-muted)' }}>Submitted</span>
                    <p className="mt-0.5 font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {formatFriendlyDateTime(request.createdAt, timezone)}
                    </p>
                  </div>
                </div>

                {/* Short leave times if applicable */}
                {detail.days?.some((d) => d.dayType === 'SHORT_LEAVE') && (
                  <p className="mt-2 text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                    Schedule: {detail.days
                      .filter((d) => d.dayType === 'SHORT_LEAVE')
                      .map((d) => `${d.shortLeaveStartTime}–${d.shortLeaveEndTime} (${formatHours(d.shortLeaveDurationMinutes)})`)
                      .join(', ')}
                  </p>
                )}
              </div>

              {/* 4. Request Reason */}
              <div className="border-t pt-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  Reason
                </h3>
                <p className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: request.reason ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                  {request.reason || 'No reason provided'}
                </p>
              </div>

              {/* 5. Approval Workflow */}
              <div className="border-t pt-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                    Approval Workflow
                  </h3>
                  {request.status === 'REJECTED' && rejectedStage && (
                    <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                      Rejected at {LEVEL_LABELS[rejectedStage.level] || rejectedStage.level}
                    </span>
                  )}
                  {request.status === 'APPROVED' && (
                    <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      All stages approved
                    </span>
                  )}
                  {['PENDING_APPROVAL', 'PARTIALLY_APPROVED'].includes(request.status) && (
                    <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
                      {request.progress?.approved ?? 0} of {request.progress?.total ?? 0} approved
                    </span>
                  )}
                </div>

                <LeaveApprovalTimeline approvals={detail.approvals} timezone={timezone} />
              </div>

              {/* 6. Activity / History (Collapsible) */}
              {sortedHistory.length > 0 && (
                <details className="group border-t pt-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
                  <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold uppercase tracking-wider select-none" style={{ color: 'var(--color-text-muted)' }}>
                    <span>Activity History ({sortedHistory.length})</span>
                    <span className="text-[11px] normal-case font-normal text-muted group-open:hidden">View</span>
                    <span className="text-[11px] normal-case font-normal text-muted hidden group-open:inline">Hide</span>
                  </summary>

                  <ol className="mt-3 relative pl-4 space-y-2 text-xs">
                    {sortedHistory.map((event, idx) => {
                      const isLast = idx === sortedHistory.length - 1;
                      const config = getEventDisplayConfig(event, LEVEL_LABELS);
                      return (
                        <li key={event.id} className="relative">
                          {!isLast && (
                            <div
                              className="absolute -left-[11px] top-3 bottom-0 w-[1px]"
                              style={{ backgroundColor: 'var(--color-border-subtle)' }}
                            />
                          )}
                          <div
                            className="absolute -left-3.5 top-1.5 h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: config.dotColor }}
                          />
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                              {config.title}
                            </span>
                            <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                              {formatFriendlyDateTime(event.at, timezone)}
                            </span>
                          </div>
                          {config.subtitle && (
                            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                              {config.subtitle}
                            </p>
                          )}
                          {config.note && (
                            <p className="mt-0.5 text-[11px] italic" style={{ color: 'var(--color-text-secondary)' }}>
                              &ldquo;{config.note}&rdquo;
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </details>
              )}
            </>
          )}
        </div>

        {/* Action Confirmation Panel (Expanded when an action is selected) */}
        {confirmation && (
          <form
            onSubmit={execute}
            className="border-t px-5 py-3 space-y-2.5 flex-shrink-0 shadow-lg"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-subtle)' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {confirmation.label}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                {confirmation.reasonRequired ? 'Reason required' : 'Comment optional'}
              </span>
            </div>
            <textarea
              autoFocus
              required={confirmation.reasonRequired}
              maxLength={confirmation.kind === 'approval' ? 1000 : 500}
              disabled={busy}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={confirmation.reasonRequired ? 'Enter reason for decision…' : 'Add optional note…'}
              className="w-full rounded-md border bg-[var(--color-input-bg)] p-2 text-xs outline-none focus:border-indigo-500 transition-colors"
              rows={2}
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmation(null)}
                className="rounded-md border px-3 py-1 text-xs font-medium hover:bg-[var(--color-bg-muted)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || loading || (confirmation.reasonRequired && !comment.trim())}
                className={`rounded-md px-3 py-1 text-xs font-medium text-white shadow-sm transition-colors cursor-pointer ${
                  confirmation.decision === 'REJECTED' || confirmation.kind === 'cancel' || confirmation.kind === 'cancelApproved'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {busy ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </form>
        )}

        {/* Sticky Action Footer (When actions are available and not confirming) */}
        {!confirmation && hasActions && (
          <div
            className="border-t px-5 py-3 flex flex-wrap items-center justify-end gap-2 flex-shrink-0"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-subtle)' }}
          >
            {/* Approver Decisions */}
            {actions.approvals?.map((stage) => (
              <React.Fragment key={stage.id}>
                {stage.canReject && (
                  <button
                    type="button"
                    disabled={busy || loading}
                    className="rounded-md border border-red-500/30 bg-red-500/5 hover:bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 transition-colors disabled:opacity-50 cursor-pointer"
                    onClick={() =>
                      choose({
                        kind: 'approval',
                        stageId: stage.id,
                        decision: 'REJECTED',
                        label: `Reject Request (${LEVEL_LABELS[stage.level] || stage.level})`,
                        reasonRequired: true
                      })
                    }
                  >
                    Reject ({LEVEL_LABELS[stage.level] || stage.level})
                  </button>
                )}
                {stage.canApprove && (
                  <button
                    type="button"
                    disabled={busy || loading}
                    className="rounded-md bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50 cursor-pointer"
                    onClick={() =>
                      choose({
                        kind: 'approval',
                        stageId: stage.id,
                        decision: 'APPROVED',
                        label: `Approve Request (${LEVEL_LABELS[stage.level] || stage.level})`
                      })
                    }
                  >
                    Approve ({LEVEL_LABELS[stage.level] || stage.level})
                  </button>
                )}
              </React.Fragment>
            ))}

            {/* Requester cancel */}
            {actions.canCancel && (
              <button
                type="button"
                disabled={busy || loading}
                className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-red-500/10 hover:text-red-600 transition-colors cursor-pointer"
                onClick={() => choose({ kind: 'cancel', label: 'Cancel Request' })}
              >
                Cancel Request
              </button>
            )}

            {/* Request cancellation of approved leave */}
            {actions.canRequestCancellation && (
              <button
                type="button"
                disabled={busy || loading}
                className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-amber-500/10 hover:text-amber-600 transition-colors cursor-pointer"
                onClick={() =>
                  choose({
                    kind: 'requestCancellation',
                    label: 'Request Cancellation',
                    reasonRequired: true
                  })
                }
              >
                Request Cancellation
              </button>
            )}

            {/* Review cancellation (HR / Admin) */}
            {actions.canReviewCancellation && (
              <>
                <button
                  type="button"
                  disabled={busy || loading}
                  className="rounded-md border border-red-500/30 bg-red-500/5 hover:bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 transition-colors cursor-pointer"
                  onClick={() =>
                    choose({
                      kind: 'reviewCancellation',
                      decision: 'rejected',
                      label: 'Reject Cancellation',
                      reasonRequired: true
                    })
                  }
                >
                  Reject Cancellation
                </button>
                <button
                  type="button"
                  disabled={busy || loading}
                  className="rounded-md bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition-colors cursor-pointer"
                  onClick={() =>
                    choose({
                      kind: 'reviewCancellation',
                      decision: 'approved',
                      label: 'Approve Cancellation'
                    })
                  }
                >
                  Approve Cancellation
                </button>
              </>
            )}

            {/* Cancel approved leave (Admin / HR) */}
            {actions.canCancelApproved && (
              <button
                type="button"
                disabled={busy || loading}
                className="rounded-md border border-red-500/30 bg-red-500/5 hover:bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 transition-colors cursor-pointer"
                onClick={() =>
                  choose({
                    kind: 'cancelApproved',
                    label: 'Cancel Approved Leave',
                    reasonRequired: true
                  })
                }
              >
                Cancel Approved Leave
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
