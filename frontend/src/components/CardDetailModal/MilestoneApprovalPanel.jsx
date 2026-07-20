import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, History, Landmark, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import AuthContext from '../../context/AuthContext';
import Database from '../../services/database';

const money = (value) => Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const isMoneyDraft = (value) => /^\d*(?:\.\d{0,2})?$/.test(value);

const formatDateTime = (value) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const displayUser = (value, fallback = 'Unknown user') => (
  value?.name || value?.email || fallback
);

const sourceTypeLabel = {
  task: 'Task',
  subtask: 'Subtask',
  nanoSubtask: 'Nano Subtask'
};

const MilestoneApprovalPanel = ({ project, source }) => {
  const { user } = useContext(AuthContext);
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [collapsedMilestoneIds, setCollapsedMilestoneIds] = useState(() => new Set());
  const idempotencyKey = useRef(null);
  const isMilestoneProject = String(project?.billingCycle || '').toLowerCase() === 'milestone';
  const canApprove = ['admin', 'manager'].includes(user?.role?.toLowerCase());

  const loadMilestones = useCallback(async () => {
    if (!isMilestoneProject || !project?._id) return;
    setLoading(true);
    try {
      const response = await Database.getProjectMilestones(project._id);
      setData(response);
      const eligible = response.milestones?.find((item) => ['active', 'in-progress'].includes(item.status));
      setSelectedId((current) => response.milestones?.some((item) => item._id === current && ['active', 'in-progress'].includes(item.status))
        ? current
        : eligible?._id || '');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [isMilestoneProject, project?._id]);

  useEffect(() => {
    loadMilestones();
  }, [loadMilestones]);

  useEffect(() => {
    setCollapsedMilestoneIds(new Set());
  }, [project?._id]);

  const selected = useMemo(
    () => data?.milestones?.find((item) => item._id === selectedId),
    [data?.milestones, selectedId]
  );

  const historyMilestones = useMemo(
    () => (data?.milestones || []).filter((milestone) => (milestone.approvals || []).length > 0),
    [data?.milestones]
  );

  const resetRequestIdentity = () => {
    idempotencyKey.current = null;
  };

  const toggleMilestoneHistory = (milestoneId) => {
    const normalizedId = String(milestoneId);
    setCollapsedMilestoneIds((current) => {
      const next = new Set(current);
      if (next.has(normalizedId)) next.delete(normalizedId);
      else next.add(normalizedId);
      return next;
    });
  };

  const submitApproval = async (event) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!selected || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error('Enter a valid approval amount');
      return;
    }
    if (numericAmount > Number(selected.remainingAmount)) {
      toast.error('Approval cannot exceed the milestone remaining amount');
      return;
    }

    if (!idempotencyKey.current) {
      idempotencyKey.current = globalThis.crypto?.randomUUID?.()
        || `milestone-${project._id}-${selected._id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    setSubmitting(true);
    try {
      const response = await Database.approveProjectMilestone(
        project._id,
        selected._id,
        { amount, note, sourceType: source?.sourceType, sourceId: source?.sourceId },
        idempotencyKey.current
      );
      toast.success(response.idempotent ? 'Approval was already recorded' : 'Milestone approval recorded');
      setAmount('');
      setNote('');
      idempotencyKey.current = null;
      await loadMilestones();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isMilestoneProject) return null;

  return (
    <>
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Landmark size={17} className="text-emerald-700" />
          <h5 className="font-semibold text-gray-800">Milestone Approval</h5>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 size={15} className="animate-spin" /> Loading milestones...
          </div>
        ) : data?.billingComplete ? (
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 size={16} /> All milestones are paid.
          </div>
        ) : !canApprove ? (
          <p className="text-sm text-amber-700">Only managers and administrators can approve milestone amounts.</p>
        ) : (
          <form onSubmit={submitApproval} className="space-y-3">
            <select
              value={selectedId}
              onChange={(event) => { setSelectedId(event.target.value); setAmount(''); resetRequestIdentity(); }}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              {(data?.milestones || []).filter((item) => ['active', 'in-progress'].includes(item.status)).map((item) => (
                <option key={item._id} value={item._id}>
                  {item.order + 1}. {item.title} (${money(item.remainingAmount)} remaining)
                </option>
              ))}
            </select>
            {selected && (
              <div className="grid grid-cols-3 gap-2 rounded-md bg-white p-3 text-xs text-gray-600">
                <span>Amount<br /><strong className="text-gray-900">${money(selected.amount)}</strong></span>
                <span>Approved<br /><strong className="text-gray-900">${money(selected.approvedAmount)}</strong></span>
                <span>Remaining<br /><strong className="text-gray-900">${money(selected.remainingAmount)}</strong></span>
              </div>
            )}
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9]+([.][0-9]{1,2})?"
              value={amount}
              onChange={(event) => {
                if (isMoneyDraft(event.target.value)) {
                  setAmount(event.target.value);
                  resetRequestIdentity();
                }
              }}
              placeholder="Approved amount"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              required
            />
            <textarea
              value={note}
              onChange={(event) => { setNote(event.target.value); resetRequestIdentity(); }}
              placeholder="Approval note (optional)"
              rows={2}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={submitting || !selectedId}
              className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {submitting ? 'Recording approval...' : 'Approve Milestone Amount'}
            </button>
          </form>
        )}
      </div>

      {!loading && historyMilestones.length > 0 && (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 lg:col-span-3">
          <div className="flex items-center gap-2">
            <History size={17} className="text-slate-600" />
            <div>
              <h5 className="font-semibold text-gray-800">Milestone History</h5>
              <p className="text-xs text-gray-500">Complete milestone approval activity.</p>
            </div>
          </div>

          {historyMilestones.map((milestone) => {
            const milestoneId = String(milestone._id);
            const isExpanded = !collapsedMilestoneIds.has(milestoneId);
            const detailsId = `milestone-history-${milestoneId}`;
            return (
              <article key={milestone._id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => toggleMilestoneHistory(milestoneId)}
                  aria-expanded={isExpanded}
                  aria-controls={detailsId}
                  className={`flex w-full flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-100 ${
                    isExpanded ? 'border-b border-slate-100' : ''
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{milestone.order + 1}. {milestone.title}</p>
                    <p className="text-xs text-gray-500">
                      ${money(milestone.approvedAmount)} approved of ${money(milestone.amount)}
                    </p>
                  </div>
                  <span className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      milestone.status === 'paid'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {milestone.status === 'paid' ? 'Paid' : 'In Progress'}
                    </span>
                    <ChevronDown
                      size={18}
                      className={`text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </span>
                </button>

                {isExpanded && (
                <div id={detailsId} className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                  {(milestone.approvals || []).map((approval) => (
                    <div key={approval._id} className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3 text-xs">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="font-semibold text-gray-600">Approved Amount</span>
                        <strong className="text-sm text-emerald-700">${money(approval.amount)}</strong>
                      </div>
                      <dl className="space-y-2 text-gray-600">
                        <div>
                          <dt className="font-semibold text-gray-700">Approval Date &amp; Time</dt>
                          <dd>{formatDateTime(approval.approvedAt)}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-gray-700">Approved By</dt>
                          <dd>{displayUser(approval.approvedBy)}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-gray-700">Approval Notes</dt>
                          <dd className="whitespace-pre-wrap break-words">{approval.note || 'No notes provided'}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-gray-700">Approval Source</dt>
                          <dd>{sourceTypeLabel[approval.sourceType] || approval.sourceType}: {approval.sourceTitle || 'Untitled'}</dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
                )}

              </article>
            );
          })}
        </section>
      )}
    </>
  );
};

export default MilestoneApprovalPanel;
