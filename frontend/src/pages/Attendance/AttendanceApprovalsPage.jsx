import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Check, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import LeaveEmptyState from '../../components/Leave/LeaveEmptyState';
import * as attendanceApi from '../../services/attendanceApi';

const Panel = ({ title, description, children }) => (
  <section className="rounded-2xl border p-4 shadow-sm sm:p-6" style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)' }}>
    <div className="mb-4">
      <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>{title}</h2>
      {description && <p className="mt-0.5 text-sm" style={{ color: 'var(--color-text-muted)' }}>{description}</p>}
    </div>
    {children}
  </section>
);

const DecisionRow = ({ entryLabel, meta, onDecide }) => {
  const [deciding, setDeciding] = useState(false);
  const decide = async (decision) => {
    setDeciding(true);
    try { await onDecide(decision); } finally { setDeciding(false); }
  };
  return (
    <div className="flex flex-col gap-2 border-b px-4 py-3 text-sm last:border-b-0 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--color-border-subtle)' }}>
      <div>
        <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{entryLabel}</span>
        {meta && <span className="ml-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>{meta}</span>}
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={deciding} onClick={() => decide('APPROVED')}><Check className="h-3.5 w-3.5" /> Approve</Button>
        <Button variant="outline" size="sm" disabled={deciding} onClick={() => decide('REJECTED')}><X className="h-3.5 w-3.5" /> Reject</Button>
      </div>
    </div>
  );
};

const AttendanceApprovalsPage = () => {
  const [wfhQueue, setWfhQueue] = useState([]);
  const [regularizationQueue, setRegularizationQueue] = useState([]);

  const load = () => {
    attendanceApi.getWfhApprovalQueue().then(({ data }) => setWfhQueue(data)).catch(() => {});
    attendanceApi.getRegularizationApprovalQueue().then(({ data }) => setRegularizationQueue(data)).catch(() => {});
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    window.addEventListener('socket-attendance-wfh-requested', load);
    window.addEventListener('socket-attendance-regularization-requested', load);
    return () => {
      window.removeEventListener('socket-attendance-wfh-requested', load);
      window.removeEventListener('socket-attendance-regularization-requested', load);
    };
  }, []);

  const decideWfh = async (approval, decision) => {
    try {
      await attendanceApi.decideWfhApproval(approval._id, decision);
      toast.success(`Request ${decision === 'APPROVED' ? 'approved' : 'rejected'}`);
      load();
    } catch { /* interceptor */ }
  };
  const decideRegularization = async (approval, decision) => {
    try {
      await attendanceApi.decideRegularizationApproval(approval._id, decision);
      toast.success(`Request ${decision === 'APPROVED' ? 'approved' : 'rejected'}`);
      load();
    } catch { /* interceptor */ }
  };

  return (
    <div className="space-y-4">
      <Panel title="Work From Home Requests" description="Awaiting your decision.">
        {!wfhQueue.length ? <LeaveEmptyState title="No pending WFH requests" compact /> : (
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-border-default)' }}>
            {wfhQueue.map((approval) => (
              <DecisionRow
                key={approval._id}
                entryLabel={approval.entity?.requester?.name || 'Unknown requester'}
                meta={approval.entity ? `${new Date(approval.entity.startDate).toLocaleDateString()} – ${new Date(approval.entity.endDate).toLocaleDateString()} · ${approval.level}` : approval.level}
                onDecide={(decision) => decideWfh(approval, decision)}
              />
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Regularization Requests" description="Awaiting your decision.">
        {!regularizationQueue.length ? <LeaveEmptyState title="No pending regularization requests" compact /> : (
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-border-default)' }}>
            {regularizationQueue.map((approval) => (
              <DecisionRow
                key={approval._id}
                entryLabel={approval.entity?.requester?.name || 'Unknown requester'}
                meta={approval.entity ? `${approval.entity.workDateKey} · ${approval.entity.type} · ${approval.level}` : approval.level}
                onDecide={(decision) => decideRegularization(approval, decision)}
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
};

export default AttendanceApprovalsPage;
