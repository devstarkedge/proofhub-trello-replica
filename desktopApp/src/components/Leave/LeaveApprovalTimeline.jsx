import React, { memo } from 'react';
import { CheckCircle2, XCircle, Clock, MinusCircle, MessageSquare } from 'lucide-react';

const LEVEL_LABELS = {
  DEPARTMENT_MANAGER: 'Department Manager',
  HR: 'Human Resources',
  ADMIN: 'Administrator'
};

const STAGE_STATUS_CONFIG = {
  APPROVED: {
    label: 'Approved',
    badgeClass: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800/60',
    icon: CheckCircle2,
    iconColor: '#10b981',
  },
  REJECTED: {
    label: 'Rejected',
    badgeClass: 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-950/40 dark:border-rose-800/60',
    icon: XCircle,
    iconColor: '#ef4444',
  },
  PENDING: {
    label: 'Pending',
    badgeClass: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800/60',
    icon: Clock,
    iconColor: '#f59e0b',
  },
  VOIDED: {
    label: 'Not Required',
    badgeClass: 'text-slate-600 bg-slate-50 border-slate-200 dark:text-slate-400 dark:bg-slate-900/40 dark:border-slate-800',
    icon: MinusCircle,
    iconColor: 'var(--color-text-muted)',
  }
};

const formatStepDate = (date, timezone) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const dateStr = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: timezone
  });
  const timeStr = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone
  });
  return `${dateStr}, ${timeStr}`;
};

/**
 * Compact, lightweight approval timeline for Leave Request Details drawer.
 */
const LeaveApprovalTimeline = memo(({ approvals = [], timezone }) => {
  if (!approvals.length) {
    return (
      <div className="py-2 text-center text-xs text-[var(--color-text-muted)]">
        No approval stages configured for this request.
      </div>
    );
  }

  return (
    <ol className="relative space-y-2">
      {approvals.map((approval, index) => {
        const config = STAGE_STATUS_CONFIG[approval.status] || STAGE_STATUS_CONFIG.PENDING;
        const Icon = config.icon;
        const isLast = index === approvals.length - 1;
        const dateStr = formatStepDate(approval.decidedAt, timezone);
        const stageNum = index + 1;

        return (
          <li key={approval._id || index} className="relative flex items-start gap-2.5">
            {/* Connecting Line */}
            {!isLast && (
              <div
                className="absolute left-3 top-6 bottom-0 w-[1.5px] -mb-2 transition-colors"
                style={{ backgroundColor: 'var(--color-border-subtle)' }}
              />
            )}

            {/* Stage Icon Node */}
            <div
              className="relative z-10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border shadow-2xs mt-0.5"
              style={{
                backgroundColor: 'var(--color-card-bg)',
                borderColor: config.iconColor,
                color: config.iconColor
              }}
            >
              <Icon className="h-3.5 w-3.5" />
            </div>

            {/* Stage Content Row */}
            <div
              className="min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 transition-all"
              style={{
                backgroundColor: 'var(--color-card-bg)',
                borderColor: 'var(--color-border-subtle)'
              }}
            >
              <div className="flex items-center justify-between gap-1.5 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-[var(--color-text-primary)]">
                    {LEVEL_LABELS[approval.level] || approval.level}
                  </span>
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    (Stage {stageNum})
                  </span>
                </div>

                <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.2 text-[10px] font-medium ${config.badgeClass}`}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: config.iconColor }} />
                  {config.label}
                </span>
              </div>

              {approval.decidedBy ? (
                <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                  Decided by <span className="font-medium text-[var(--color-text-secondary)]">{approval.decidedBy.name}</span>
                  {dateStr && <span> · {dateStr}</span>}
                </p>
              ) : (
                <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                  Awaiting review
                  {Array.isArray(approval.eligibleApproverUserIds) && approval.eligibleApproverUserIds.length > 0 && (
                    <span> ({approval.eligibleApproverUserIds.length} eligible)</span>
                  )}
                </p>
              )}

              {approval.comment && (
                <div
                  className="mt-1 flex items-start gap-1 rounded p-1.5 text-[11px] italic"
                  style={{
                    backgroundColor: 'var(--color-bg-subtle)',
                    color: 'var(--color-text-secondary)'
                  }}
                >
                  <MessageSquare className="mt-0.5 h-3 w-3 flex-shrink-0 text-[var(--color-text-muted)]" />
                  <p className="leading-tight">&ldquo;{approval.comment}&rdquo;</p>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
});

LeaveApprovalTimeline.displayName = 'LeaveApprovalTimeline';

export default LeaveApprovalTimeline;
