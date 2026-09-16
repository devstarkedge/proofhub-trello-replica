import React from 'react';
import { CheckCircle2, XCircle, Clock, MinusCircle } from 'lucide-react';

const LEVEL_LABELS = { DEPARTMENT_MANAGER: 'Department Manager', HR: 'HR', ADMIN: 'Admin' };

const STATUS_ICON = {
  APPROVED: <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--color-success)' }} />,
  REJECTED: <XCircle className="w-4 h-4" style={{ color: 'var(--color-error)' }} />,
  PENDING: <Clock className="w-4 h-4" style={{ color: 'var(--color-warning)' }} />,
  VOIDED: <MinusCircle className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
};

/**
 * The complete, permanent approval timeline — per spec §14, every level's
 * decision (or still-pending/voided state) must remain visible to
 * authorized viewers, never collapsed into a single generic status.
 */
const LeaveApprovalTimeline = ({ approvals = [] }) => {
  if (!approvals.length) {
    return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No approval chain yet.</p>;
  }

  return (
    <ol className="space-y-3">
      {approvals.map((approval) => (
        <li key={approval._id} className="flex items-start gap-3">
          <div className="mt-0.5">{STATUS_ICON[approval.status] || STATUS_ICON.PENDING}</div>
          <div className="min-w-0">
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
              {LEVEL_LABELS[approval.level] || approval.level}
              <span className="ml-2 text-xs font-normal" style={{ color: 'var(--color-text-muted)' }}>{approval.status}</span>
            </p>
            {approval.decidedBy && (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                by {approval.decidedBy.name || 'someone'} on {new Date(approval.decidedAt).toLocaleString()}
              </p>
            )}
            {!approval.decidedBy && approval.status === 'PENDING' && (approval.eligibleApproverUserIds || []).length === 0 && (
              <p className="text-xs" style={{ color: 'var(--color-error-text)' }}>
                No eligible approver — an Admin must configure an alternate approver.
              </p>
            )}
            {approval.comment && (
              <p className="text-xs italic mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>&ldquo;{approval.comment}&rdquo;</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
};

export default LeaveApprovalTimeline;
