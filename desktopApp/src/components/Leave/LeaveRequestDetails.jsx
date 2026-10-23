import React, { useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  X,
  Link as LinkIcon,
  Check,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Calendar,
  CalendarDays,
  Mail,
  FileText,
  History,
  ChevronDown,
  Shield,
  Ban,
  MessageSquare
} from 'lucide-react';
import { toast } from 'react-toastify';
import * as leaveApi from '../../services/leaveApi';
import LeaveApprovalTimeline from './LeaveApprovalTimeline';
import useLeaveQuery from '../../hooks/useLeaveQuery';
import { formatHours } from '../../utils/duration';
import { formatFriendlyDateTime, formatFriendlyDateRange, formatFriendlyDuration } from '../../utils/leavePresentation';
import WorkspaceContext from '../../context/WorkspaceContext';
import AuthContext from '../../context/AuthContext';
import { isLeaveBackgroundActionPending, subscribeLeaveBackgroundActions } from '../../utils/leaveBackgroundActions';
import { leaveRequestActionKey, runLeaveRequestAction } from '../../utils/leaveRequestActions';

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

export default function LeaveRequestDetails({ requestId, onClose }) {
  const { currentWorkspace } = useContext(WorkspaceContext);
  const { user } = useContext(AuthContext);
  const workspaceId = currentWorkspace?._id, userId = user?._id || user?.id;
  const actionKey = leaveRequestActionKey(workspaceId, userId, requestId);
  const busy = useSyncExternalStore(subscribeLeaveBackgroundActions,
    () => isLeaveBackgroundActionPending(actionKey), () => false);
  const read = useLeaveQuery('request-detail', requestId, leaveApi.getRequestDetail);
  const detail = read.isError ? null : read.data;
  const loading = read.isPending;
  const [actionError, setError] = useState('');
  const error = actionError || read.error?.response?.data?.message || (read.isError ? 'Unable to load request details.' : '');
  const [confirmation, setConfirmation] = useState(null);
  const [comment, setComment] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const panel = useRef(null);

  useEffect(() => {
    if (!detail) {
      setConfirmation(null);
      setError('');
    }
  }, [detail]);

  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.querySelector('button')?.focus();
    return () => previous?.focus?.();
  }, []);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/leave?request=${requestId}`);
      setCopiedLink(true);
      toast.success('Request link copied');
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

  const execute = (event) => {
    event.preventDefault();
    if (isLeaveBackgroundActionPending(actionKey) || !confirmation || loading) return;
    if (!workspaceId || !userId) {
      setError('Select a workspace before updating leave.');
      return;
    }
    if (confirmation.reasonRequired && !comment.trim()) return;
    runLeaveRequestAction({ ...confirmation, workspaceId, userId, requestId, comment });
    onClose();
  };

  const trapFocus = (event) => {
    if (event.key === 'Escape') onClose();
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
      className="fixed inset-0 z-[999] flex justify-end bg-black/40 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-150"
      onClick={onClose}
    >
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-detail-title"
        onKeyDown={trapFocus}
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full max-w-full sm:max-w-[480px] flex-col shadow-2xl transition-all border-l animate-in slide-in-from-right duration-200"
        style={{
          backgroundColor: 'var(--color-bg-base)',
          color: 'var(--color-text-primary)',
          borderColor: 'var(--color-border-subtle)'
        }}
      >
        {/* Compact Header */}
        <div
          className="flex h-13 items-center justify-between border-b px-4 sm:px-5 flex-shrink-0"
          style={{
            borderColor: 'var(--color-border-subtle)',
            backgroundColor: 'var(--color-card-bg)'
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 shadow-2xs"
              style={{
                backgroundColor: 'var(--color-primary-subtle)',
                color: 'var(--color-primary)'
              }}
            >
              <Calendar className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 id="leave-detail-title" className="text-sm font-bold tracking-tight truncate leading-tight">
                Leave Request Details
              </h2>
              <p className="text-[10px] text-[var(--color-text-muted)] font-mono leading-tight">
                #{String(request?._id || requestId).slice(-6).toUpperCase()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold hover:bg-[var(--color-bg-subtle)] transition-all cursor-pointer shadow-2xs active:scale-95"
              style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' }}
              title="Copy request link"
            >
              {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <LinkIcon className="h-3.5 w-3.5" />}
              <span>{copiedLink ? 'Copied' : 'Share Link'}</span>
            </button>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-[var(--color-bg-muted)] transition-all cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] active:scale-95"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body - Compact Spacing */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3.5 space-y-2.5">
          {busy && (
            <div role="status" className="flex items-center gap-2 rounded-xl bg-[var(--color-primary-subtle)] p-2.5 text-xs text-[var(--color-text-secondary)]">
              <Clock className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
              <span>Saving your leave update. You can continue working.</span>
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-400"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span className="leading-tight font-medium">{error}</span>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-3 text-xs font-medium text-[var(--color-text-muted)]">
              <Clock className="h-3.5 w-3.5 animate-spin text-indigo-500" />
              <span>Updating…</span>
            </div>
          )}

          {request && (
            <>
              {/* 1. Sleek Compact Status Strip */}
              {(() => {
                const status = request.status;
                if (status === 'REJECTED') {
                  return (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs dark:border-rose-900/50 dark:bg-rose-950/30">
                      <div className="flex items-center gap-2 min-w-0">
                        <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 flex-shrink-0" />
                        <span className="font-bold text-rose-900 dark:text-rose-100 truncate">Leave Rejected</span>
                        {statusReason && (
                          <span className="text-[11px] text-rose-700 dark:text-rose-300 truncate">· &ldquo;{statusReason}&rdquo;</span>
                        )}
                      </div>
                      <span className="rounded-full bg-rose-100 dark:bg-rose-900 px-2 py-0.5 text-[10px] font-semibold text-rose-800 dark:text-rose-200 flex-shrink-0">
                        Rejected
                      </span>
                    </div>
                  );
                }
                if (status === 'APPROVED') {
                  return (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs dark:border-emerald-900/50 dark:bg-emerald-950/30">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                        <span className="font-bold text-emerald-900 dark:text-emerald-100 truncate">Leave Approved</span>
                        <span className="text-[11px] text-emerald-700 dark:text-emerald-300 truncate">· All stages completed</span>
                      </div>
                      <span className="rounded-full bg-emerald-100 dark:bg-emerald-900 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-200 flex-shrink-0">
                        Approved
                      </span>
                    </div>
                  );
                }
                if (status === 'PENDING_APPROVAL' || status === 'PARTIALLY_APPROVED') {
                  const approvedCount = request.progress?.approved ?? 0;
                  const totalCount = request.progress?.total ?? 1;
                  const pendingStage = detail?.approvals?.find((a) => a.status === 'PENDING');
                  const nextRole = pendingStage ? (LEVEL_LABELS[pendingStage.level] || pendingStage.level) : 'Reviewer';
                  return (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs dark:border-amber-900/50 dark:bg-amber-950/30">
                      <div className="flex items-center gap-2 min-w-0">
                        <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                        <span className="font-bold text-amber-900 dark:text-amber-100">
                          {status === 'PARTIALLY_APPROVED' ? 'Partially Approved' : 'Pending Approval'}
                        </span>
                        <span className="text-[11px] text-amber-700 dark:text-amber-300 truncate hidden sm:inline">
                          · Awaiting {nextRole}
                        </span>
                      </div>
                      <span className="rounded-full bg-amber-100/90 dark:bg-amber-900/60 border border-amber-300 dark:border-amber-700 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200 flex-shrink-0">
                        {approvedCount} of {totalCount} approved
                      </span>
                    </div>
                  );
                }
                if (status === 'CANCELLATION_REQUESTED') {
                  return (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs dark:border-amber-900/50 dark:bg-amber-950/30">
                      <div className="flex items-center gap-2 min-w-0">
                        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                        <span className="font-bold text-amber-900 dark:text-amber-100 truncate">Cancellation Requested</span>
                      </div>
                      <span className="rounded-full bg-amber-100 dark:bg-amber-900 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200 flex-shrink-0">
                        Reviewing
                      </span>
                    </div>
                  );
                }
                return (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900/30">
                    <div className="flex items-center gap-2 min-w-0">
                      <Ban className="h-4 w-4 text-slate-600 dark:text-slate-400 flex-shrink-0" />
                      <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{status.replace(/_/g, ' ')}</span>
                    </div>
                    <span className="text-[11px] text-slate-500">Closed</span>
                  </div>
                );
              })()}

              {/* 2. Compact Employee Profile Card */}
              <div
                className="rounded-xl border p-2.5 shadow-2xs"
                style={{
                  backgroundColor: 'var(--color-card-bg)',
                  borderColor: 'var(--color-border-subtle)'
                }}
              >
                <div className="flex items-center gap-2.5">
                  {request.requester?.avatar ? (
                    <img
                      src={request.requester.avatar}
                      alt={request.requester.name || ''}
                      className="h-8 w-8 rounded-full object-cover border border-[var(--color-border-subtle)] shadow-xs flex-shrink-0"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shadow-xs flex-shrink-0 bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
                      {(request.requester?.name || 'E').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="text-xs font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {request.requester?.name || 'Employee'}
                      </h3>
                      {departmentNames && (
                        <span className="inline-flex items-center rounded-full px-1.5 py-0.2 text-[9px] font-semibold bg-[var(--color-primary-subtle)] text-[var(--color-primary)] border border-[var(--color-primary)]/20">
                          {departmentNames}
                        </span>
                      )}
                      {request.requester?.designation && (
                        <span className="text-[10px] text-[var(--color-text-muted)] truncate">
                          · {request.requester.designation}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--color-text-muted)] truncate flex items-center gap-1 mt-0.5">
                      <Mail className="h-3 w-3 flex-shrink-0" />
                      <span>{request.requester?.email || 'No email registered'}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* 3. Leave Summary - Unified Compact 2x2 Grid */}
              <div
                className="rounded-xl border p-3 shadow-2xs text-xs"
                style={{
                  backgroundColor: 'var(--color-card-bg)',
                  borderColor: 'var(--color-border-subtle)'
                }}
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--color-border-subtle)]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-indigo-500" />
                    Leave Summary
                  </span>
                  <span className="text-[10px] font-semibold text-[var(--color-text-secondary)] bg-[var(--color-bg-subtle)] px-2 py-0.5 rounded-full border border-[var(--color-border-subtle)]">
                    {request.totalRequestedDayUnits} {request.totalRequestedDayUnits === 1 ? 'Day Unit' : 'Day Units'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div>
                    <span className="text-[10px] text-[var(--color-text-muted)] block">Leave Type</span>
                    <span className="font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5 mt-0.5">
                      <span
                        className="h-2 w-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: request.leaveType?.color || '#3b82f6' }}
                      />
                      <span className="truncate">{request.leaveType?.name || 'Leave'}</span>
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[var(--color-text-muted)] block">Duration</span>
                    <span className="font-semibold text-[var(--color-text-primary)] mt-0.5 block">
                      {formatFriendlyDuration(request.totalRequestedDayUnits, request.leaveType?.category)}
                      {detail.days?.[0]?.dayType && detail.days[0].dayType !== 'FULL_DAY' && (
                        <span className="text-[10px] font-normal text-[var(--color-text-muted)] ml-1">
                          ({DAY_TYPE_LABELS[detail.days[0].dayType] || detail.days[0].dayType})
                        </span>
                      )}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[var(--color-text-muted)] block">Leave Dates</span>
                    <span className="font-semibold text-[var(--color-text-primary)] mt-0.5 block truncate">
                      {formatFriendlyDateRange(
                        request.startDateKey || request.startDate,
                        request.endDateKey || request.endDate,
                        timezone
                      )}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[var(--color-text-muted)] block">Submitted On</span>
                    <span className="font-semibold text-[var(--color-text-primary)] mt-0.5 block truncate">
                      {formatFriendlyDateTime(request.createdAt, timezone)}
                    </span>
                  </div>
                </div>

                {detail.days?.some((d) => d.dayType === 'SHORT_LEAVE') && (
                  <div className="mt-2.5 rounded-lg border p-2 text-[11px] flex items-center gap-1.5 bg-indigo-50/60 border-indigo-100 dark:bg-indigo-950/30 dark:border-indigo-900/50 text-indigo-900 dark:text-indigo-200">
                    <Clock className="h-3 w-3 text-indigo-500 flex-shrink-0" />
                    <span>
                      Schedule: {detail.days
                        .filter((d) => d.dayType === 'SHORT_LEAVE')
                        .map((d) => `${d.shortLeaveStartTime}–${d.shortLeaveEndTime} (${formatHours(d.shortLeaveDurationMinutes)})`)
                        .join(', ')}
                    </span>
                  </div>
                )}
              </div>

              {/* 4. Reason Card - Compact */}
              <div
                className="rounded-xl border p-3 shadow-2xs"
                style={{
                  backgroundColor: 'var(--color-card-bg)',
                  borderColor: 'var(--color-border-subtle)'
                }}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-1.5 mb-1.5">
                  <FileText className="h-3.5 w-3.5 text-purple-500" />
                  Reason for Request
                </span>
                {request.reason ? (
                  <div
                    className="rounded-lg p-2.5 text-xs leading-relaxed border-l-3 border-indigo-500"
                    style={{
                      backgroundColor: 'var(--color-bg-subtle)',
                      color: 'var(--color-text-primary)'
                    }}
                  >
                    <p className="whitespace-pre-wrap">{request.reason}</p>
                  </div>
                ) : (
                  <p className="text-xs italic text-[var(--color-text-muted)]">
                    No reason provided.
                  </p>
                )}
              </div>

              {/* 5. Approval Workflow Card - Compact */}
              <div
                className="rounded-xl border p-3 shadow-2xs"
                style={{
                  backgroundColor: 'var(--color-card-bg)',
                  borderColor: 'var(--color-border-subtle)'
                }}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-emerald-500" />
                    Approval Workflow
                  </span>
                  {['PENDING_APPROVAL', 'PARTIALLY_APPROVED'].includes(request.status) && (
                    <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.2 rounded-full dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800">
                      {request.progress?.approved ?? 0} of {request.progress?.total ?? 0} approved
                    </span>
                  )}
                </div>

                <p className="mb-2.5 text-[11px] text-[var(--color-text-muted)]">Requires Admin approval and one approval from a Manager or HR.</p>
                <LeaveApprovalTimeline approvals={detail.approvals} timezone={timezone} />
              </div>

              {/* 6. Activity History - Compact Accordion */}
              {sortedHistory.length > 0 && (
                <div
                  className="rounded-xl border overflow-hidden shadow-2xs"
                  style={{
                    backgroundColor: 'var(--color-card-bg)',
                    borderColor: 'var(--color-border-subtle)'
                  }}
                >
                  <details className="group">
                    <summary className="flex cursor-pointer items-center justify-between p-2.5 text-xs font-semibold select-none transition-colors hover:bg-[var(--color-bg-subtle)]">
                      <div className="flex items-center gap-1.5">
                        <History className="h-3.5 w-3.5 text-blue-500" />
                        <span style={{ color: 'var(--color-text-primary)' }}>Activity History</span>
                        <span className="rounded-full bg-[var(--color-bg-muted)] px-1.5 py-0.2 text-[9px] font-bold text-[var(--color-text-secondary)]">
                          {sortedHistory.length}
                        </span>
                      </div>
                      <ChevronDown className="h-3.5 w-3.5 text-[var(--color-text-muted)] transition-transform duration-200 group-open:rotate-180" />
                    </summary>

                    <div
                      className="border-t px-3 py-2.5"
                      style={{
                        borderColor: 'var(--color-border-subtle)',
                        backgroundColor: 'var(--color-bg-subtle)'
                      }}
                    >
                      <ol className="relative pl-2.5 space-y-2 text-xs">
                        {sortedHistory.map((event, idx) => {
                          const isLast = idx === sortedHistory.length - 1;
                          const config = getEventDisplayConfig(event, LEVEL_LABELS);
                          return (
                            <li key={event.id || idx} className="relative pl-2.5">
                              {!isLast && (
                                <div
                                  className="absolute left-[2px] top-2 bottom-0 w-[1px]"
                                  style={{ backgroundColor: 'var(--color-border-subtle)' }}
                                />
                              )}
                              <div
                                className="absolute -left-[1px] top-1.5 h-1.5 w-1.5 rounded-full ring-2 ring-[var(--color-card-bg)]"
                                style={{ backgroundColor: config.dotColor }}
                              />
                              <div className="flex items-baseline justify-between gap-1.5 flex-wrap">
                                <span className="font-semibold text-[11px]" style={{ color: 'var(--color-text-primary)' }}>
                                  {config.title}
                                </span>
                                <span className="text-[10px] text-[var(--color-text-muted)]">
                                  {formatFriendlyDateTime(event.at, timezone)}
                                </span>
                              </div>
                              {config.subtitle && (
                                <p className="text-[10px] text-[var(--color-text-muted)]">
                                  {config.subtitle}
                                </p>
                              )}
                              {config.note && (
                                <p className="mt-0.5 text-[10px] italic text-[var(--color-text-secondary)] bg-[var(--color-card-bg)] border border-[var(--color-border-subtle)] rounded p-1 leading-tight">
                                  &ldquo;{config.note}&rdquo;
                                </p>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  </details>
                </div>
              )}
            </>
          )}
        </div>

        {/* Action Confirmation Panel (when an action is initiated) */}
        {confirmation && (
          <form
            onSubmit={execute}
            className="border-t p-3.5 space-y-2.5 flex-shrink-0 shadow-lg animate-in slide-in-from-bottom duration-150"
            style={{
              backgroundColor: 'var(--color-card-bg)',
              borderColor: 'var(--color-border-subtle)'
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${confirmation.decision === 'REJECTED' || confirmation.kind?.includes('cancel') ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                <h4 className="text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>
                  {confirmation.label}
                </h4>
              </div>
              <span
                className={`text-[10px] font-medium px-2 py-0.2 rounded-full ${
                  confirmation.reasonRequired
                    ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {confirmation.reasonRequired ? 'Reason Required' : 'Note Optional'}
              </span>
            </div>

            <textarea
              autoFocus
              required={confirmation.reasonRequired}
              maxLength={confirmation.kind === 'approval' ? 1000 : 500}
              disabled={busy}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={confirmation.reasonRequired ? 'Enter reason for this decision…' : 'Add optional note…'}
              className="w-full rounded-lg border bg-[var(--color-bg-subtle)] p-2 text-xs outline-none focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
              style={{
                borderColor: 'var(--color-border-default)',
                color: 'var(--color-text-primary)'
              }}
              rows={2}
            />

            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                {comment.length}/{confirmation.kind === 'approval' ? 1000 : 500}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmation(null)}
                  className="rounded-lg border px-3 py-1 text-xs font-semibold hover:bg-[var(--color-bg-muted)] transition-colors cursor-pointer"
                  style={{
                    borderColor: 'var(--color-border-default)',
                    color: 'var(--color-text-secondary)'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || loading || (confirmation.reasonRequired && !comment.trim())}
                  className={`rounded-lg px-3.5 py-1 text-xs font-semibold text-white shadow-xs transition-all cursor-pointer flex items-center gap-1 active:scale-95 ${
                    confirmation.decision === 'REJECTED' || confirmation.kind === 'cancel' || confirmation.kind === 'cancelApproved'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {busy ? (
                    <>
                      <Clock className="h-3 w-3 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      {confirmation.decision === 'REJECTED' ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                      Confirm
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Action Footer - Compact & Crisp */}
        {!confirmation && hasActions && (
          <div
            className="border-t p-3 sm:px-4 sm:py-3 flex-shrink-0"
            style={{
              backgroundColor: 'var(--color-card-bg)',
              borderColor: 'var(--color-border-subtle)'
            }}
          >
            {/* Multiple Approver Stages (e.g. Dept Manager + Administrator) */}
            {Array.isArray(actions.approvals) && actions.approvals.length > 1 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs px-0.5">
                  <span className="font-bold text-[var(--color-text-primary)]">
                    Pending Decisions
                  </span>
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    {actions.approvals.length} roles eligible
                  </span>
                </div>

                <div className="space-y-1.5">
                  {actions.approvals.map((stage) => {
                    const roleLabel = LEVEL_LABELS[stage.level] || stage.level;
                    return (
                      <div
                        key={stage.id}
                        className="flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg border transition-all"
                        style={{
                          backgroundColor: 'var(--color-bg-subtle)',
                          borderColor: 'var(--color-border-subtle)'
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold block truncate" style={{ color: 'var(--color-text-primary)' }}>
                            {roleLabel}
                          </span>
                          <span className="text-[10px] text-[var(--color-text-muted)] block leading-tight">
                            Review decision required
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {stage.canReject && (
                            <button
                              type="button"
                              disabled={busy || loading}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-rose-300 dark:border-rose-900 bg-rose-50/60 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 transition-all cursor-pointer flex items-center gap-1 active:scale-95 disabled:opacity-50"
                              onClick={() =>
                                choose({
                                  kind: 'approval',
                                  stageId: stage.id,
                                  decision: 'REJECTED',
                                  label: `Reject Request (${roleLabel})`,
                                  reasonRequired: true
                                })
                              }
                            >
                              <X className="h-3 w-3" />
                              Decline
                            </button>
                          )}
                          {stage.canApprove && (
                            <button
                              type="button"
                              disabled={busy || loading}
                              className="px-3 py-1 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs hover:shadow-xs transition-all cursor-pointer flex items-center gap-1 active:scale-95 disabled:opacity-50"
                              onClick={() =>
                                choose({
                                  kind: 'approval',
                                  stageId: stage.id,
                                  decision: 'APPROVED',
                                  label: `Approve Request (${roleLabel})`
                                })
                              }
                            >
                              <Check className="h-3 w-3" />
                              Approve
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Single Approver Stage */}
            {Array.isArray(actions.approvals) && actions.approvals.length === 1 && (
              <div className="flex items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-text-muted)] tracking-wider block leading-tight">
                    Review As
                  </span>
                  <span className="text-xs font-bold text-[var(--color-text-primary)] truncate block">
                    {LEVEL_LABELS[actions.approvals[0].level] || actions.approvals[0].level}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {actions.approvals[0].canReject && (
                    <button
                      type="button"
                      disabled={busy || loading}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-rose-300 dark:border-rose-900 bg-rose-50/60 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 transition-all cursor-pointer flex items-center gap-1 active:scale-95 disabled:opacity-50"
                      onClick={() =>
                        choose({
                          kind: 'approval',
                          stageId: actions.approvals[0].id,
                          decision: 'REJECTED',
                          label: `Reject Request (${LEVEL_LABELS[actions.approvals[0].level] || actions.approvals[0].level})`,
                          reasonRequired: true
                        })
                      }
                    >
                      <X className="h-3 w-3" />
                      Decline
                    </button>
                  )}
                  {actions.approvals[0].canApprove && (
                    <button
                      type="button"
                      disabled={busy || loading}
                      className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs hover:shadow-xs transition-all cursor-pointer flex items-center gap-1 active:scale-95 disabled:opacity-50"
                      onClick={() =>
                        choose({
                          kind: 'approval',
                          stageId: actions.approvals[0].id,
                          decision: 'APPROVED',
                          label: `Approve Request (${LEVEL_LABELS[actions.approvals[0].level] || actions.approvals[0].level})`
                        })
                      }
                    >
                      <Check className="h-3 w-3" />
                      Approve
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Requester cancel pending request */}
            {actions.canCancel && (
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={busy || loading}
                  className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                  onClick={() => choose({ kind: 'cancel', label: 'Cancel Leave Request', reasonRequired: false })}
                >
                  <Ban className="h-3 w-3" />
                  Cancel My Request
                </button>
              </div>
            )}

            {/* Request cancellation of approved leave */}
            {actions.canRequestCancellation && (
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={busy || loading}
                  className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                  onClick={() =>
                    choose({
                      kind: 'requestCancellation',
                      label: 'Request Cancellation of Approved Leave',
                      reasonRequired: true
                    })
                  }
                >
                  <AlertCircle className="h-3 w-3" />
                  Request Cancellation
                </button>
              </div>
            )}

            {/* Review cancellation (HR / Admin) */}
            {actions.canReviewCancellation && (
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold block text-[var(--color-text-primary)]">
                    Cancellation Review
                  </span>
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    Cancellation requested
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={busy || loading}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-rose-300 dark:border-rose-900 bg-rose-50/60 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 transition-all cursor-pointer active:scale-95"
                    onClick={() =>
                      choose({
                        kind: 'reviewCancellation',
                        decision: 'rejected',
                        label: 'Reject Cancellation Request',
                        reasonRequired: true
                      })
                    }
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    disabled={busy || loading}
                    className="px-3 py-1 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all cursor-pointer active:scale-95"
                    onClick={() =>
                      choose({
                        kind: 'reviewCancellation',
                        decision: 'approved',
                        label: 'Approve Cancellation Request'
                      })
                    }
                  >
                    Approve
                  </button>
                </div>
              </div>
            )}

            {/* Cancel approved leave directly (Admin / HR) */}
            {actions.canCancelApproved && (
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={busy || loading}
                  className="rounded-lg border border-rose-300 dark:border-rose-900 bg-rose-50/60 hover:bg-rose-100 dark:bg-rose-950/40 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                  onClick={() =>
                    choose({
                      kind: 'cancelApproved',
                      label: 'Cancel Approved Leave',
                      reasonRequired: true
                    })
                  }
                >
                  <Ban className="h-3 w-3" />
                  Cancel Approved Leave
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
