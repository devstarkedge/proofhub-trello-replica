import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { Calendar, ClipboardCheck } from 'lucide-react';
import ApprovalDecisionModal from '../../components/Leave/ApprovalDecisionModal';
import LeaveEmptyState from '../../components/Leave/LeaveEmptyState';
import LeavePageHeader from '../../components/Leave/LeavePageHeader';
import useLeaveStore from '../../store/leaveStore';

const formatDate = (value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const ApprovalQueuePage = () => {
  const { approvalQueue, fetchApprovalQueue, decideApproval, handleApprovalUpdated } = useLeaveStore();
  const [active, setActive] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(() => { fetchApprovalQueue().catch(() => {}); }, [fetchApprovalQueue]);
  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const handler = (event) => { handleApprovalUpdated(event.detail); refresh(); };
    window.addEventListener('socket-leave-approval-updated', handler);
    return () => window.removeEventListener('socket-leave-approval-updated', handler);
  }, [handleApprovalUpdated, refresh]);

  const decide = async (decision, comment) => {
    setSubmitting(true);
    try {
      await decideApproval(active._id, decision, comment);
      toast.success(decision === 'APPROVED' ? 'Approved' : 'Rejected');
      setActive(null);
    } catch {
      // interceptor already toasts
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-7">
      <LeavePageHeader
        title="Approval Queue"
        description="Review leave requests that are waiting for your decision."
        icon={ClipboardCheck}
      />

      {!approvalQueue.length && (
        <LeaveEmptyState
          icon={ClipboardCheck}
          title="You’re all caught up"
          description="There are no leave requests awaiting your decision. New requests will appear here automatically."
        />
      )}

      <div className="space-y-2">
        {approvalQueue.map((item) => (
          <button
            key={item._id}
            onClick={() => setActive(item)}
            className="flex w-full flex-col gap-3 rounded-xl border p-4 text-left transition-all hover:-translate-y-px hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg-muted)' }}>
                <Calendar className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{item.request?.requester?.name}</p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {item.request?.leaveType?.name} · {formatDate(item.request?.startDate)} – {formatDate(item.request?.endDate)}
                </p>
              </div>
            </div>
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning-text)' }}
            >
              {item.level.replace('_', ' ')}
            </span>
          </button>
        ))}
      </div>

      <ApprovalDecisionModal
        isOpen={Boolean(active)}
        request={active?.request}
        isSubmitting={submitting}
        onApprove={(comment) => decide('APPROVED', comment)}
        onReject={(comment) => decide('REJECTED', comment)}
        onCancel={() => setActive(null)}
      />
    </div>
  );
};

export default ApprovalQueuePage;
