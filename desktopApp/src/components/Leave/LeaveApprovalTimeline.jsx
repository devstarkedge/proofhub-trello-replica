
import { CheckCircle2, XCircle, Clock, MinusCircle } from 'lucide-react';

const LEVEL_LABELS = {
  DEPARTMENT_MANAGER: 'Department Manager',
  HR: 'Human Resources',
  ADMIN: 'Administrator'
};

const STAGE_STATUS_CONFIG = {
  APPROVED: {
    label: 'Approved',
    badgeClass: 'text-emerald-700 bg-emerald-500/10 dark:text-emerald-400',
    icon: CheckCircle2,
    iconColor: 'var(--color-success)'
  },
  REJECTED: {
    label: 'Rejected',
    badgeClass: 'text-rose-700 bg-rose-500/10 dark:text-rose-400',
    icon: XCircle,
    iconColor: 'var(--color-error)'
  },
  PENDING: {
    label: 'Pending',
    badgeClass: 'text-amber-700 bg-amber-500/10 dark:text-amber-400',
    icon: Clock,
    iconColor: 'var(--color-warning)'
  },
  VOIDED: {
    label: 'Not Required',
    badgeClass: 'text-slate-600 bg-slate-500/10 dark:text-slate-400',
    icon: MinusCircle,
    iconColor: 'var(--color-text-muted)'
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
 * Compact, lightweight approval timeline for enterprise SaaS drawers.
 */
const LeaveApprovalTimeline = ({ approvals = [], timezone }) => {
  if (!approvals.length) {
    return <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No approval stages configured.</p>;
  }

  return (
    <ol className="relative space-y-2">
      {approvals.map((approval, index) => {
        const config = STAGE_STATUS_CONFIG[approval.status] || STAGE_STATUS_CONFIG.PENDING;
        const Icon = config.icon;
        const isLast = index === approvals.length - 1;
        const dateStr = formatStepDate(approval.decidedAt, timezone);

        return (
          <li key={approval._id} className="relative flex items-start gap-2.5 text-xs">
            {/* Subtle vertical connector */}
            {!isLast && (
              <div
                className="absolute left-[7px] top-4.5 bottom-0 w-[1px] -mb-2"
                style={{ backgroundColor: 'var(--color-border-subtle)' }}
              />
            )}

            {/* Icon */}
            <Icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 z-10" style={{ color: config.iconColor }} />

            {/* Content row */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  {LEVEL_LABELS[approval.level] || approval.level}
                </span>
                <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${config.badgeClass}`}>
                  {config.label}
                </span>
              </div>

              {approval.decidedBy && (
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  by {approval.decidedBy.name}{dateStr ? ` · ${dateStr}` : ''}
                </p>
              )}

              {approval.status === 'PENDING' && (approval.eligibleApproverUserIds || []).length === 0 && (
                <p className="text-[11px] mt-0.5 font-medium" style={{ color: 'var(--color-error-text)' }}>
                  No approver currently assigned
                </p>
              )}

              {approval.comment && (
                <p
                  className="mt-1 text-[11px] italic rounded px-2 py-1 leading-snug"
                  style={{ backgroundColor: 'var(--color-bg-subtle)', color: 'var(--color-text-secondary)' }}
                >
                  &ldquo;{approval.comment}&rdquo;
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export default LeaveApprovalTimeline;
