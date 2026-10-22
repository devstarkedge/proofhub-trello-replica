import { formatActivityQuantity, formatFriendlyDateRange } from '../../utils/leavePresentation';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import * as leaveApi from '../../services/leaveApi';
import useLeaveQuery from '../../hooks/useLeaveQuery';

const TYPES = [['all', 'All Activity'], ['allocation', 'Policy Allocation'], ['manual_credit', 'Manual Credit'], ['manual_debit', 'Manual Debit'], ['used', 'Used Leave'], ['expired', 'Leave Expired'], ['reserved', 'Reservation'], ['released', 'Reservation Release'], ['restored', 'Restored Leave'], ['reconciliation', 'Policy Reconciliation'], ['carry_forward', 'Carry-Forward']];
const scopeLabels = { workspace: 'Workspace default', employee: 'User override', department: 'Department override', role: 'Role override' };
const toneFor = (category) => ({ allocation: 'info', manual_credit: 'success', manual_debit: 'error', expired: 'warning', reconciliation: 'info', carry_forward: 'info', restored: 'success' })[category] || 'text';

const when = (date, timezone) => date ? new Date(date).toLocaleString(undefined, { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }) : '—';

function ActivityDetails({ activityId, timezone, onClose, onOpenRequest }) {
  const read = useLeaveQuery('activity-detail', activityId, leaveApi.getMyLeaveActivityDetail);
  const activity = read.isError ? null : read.data;
  const error = read.error?.response?.data?.message || (read.isError ? 'Unable to load activity details.' : '');
  const dialog = useRef(null);
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  return <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); onClose(); }} aria-labelledby="activity-detail-title" className="max-h-[85vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border p-5 shadow-xl backdrop:bg-black/40" style={{ backgroundColor: 'var(--color-bg-base)', color: 'var(--color-text-primary)', borderColor: 'var(--color-border-default)' }}>
    <div className="mb-5 flex items-center justify-between gap-3"><h3 id="activity-detail-title" className="font-semibold">{activity?.label || 'Balance activity details'}</h3><button type="button" aria-label="Close activity details" onClick={onClose} className="rounded-lg p-2"><X className="h-4 w-4" /></button></div>
    {error ? <p role="alert">{error}</p> : !activity ? <p role="status">Loading activity…</p> : <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">{[
        ['Leave type', activity.leaveType?.name || 'Historical leave type'], ['Quantity', formatActivityQuantity(activity)],
        ['Date & time', when(activity.occurredAt, timezone)], ['Source / Performed by', activity.source],
        ['Reason', activity.reason], ['Transaction reference', activity.transactionReference]
      ].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{label}</dt><dd className="mt-1 break-words whitespace-pre-wrap">{value}</dd></div>)}</dl>
      {activity.note && <p className="rounded-lg bg-[var(--color-bg-muted)] p-3 text-xs">{activity.note}</p>}
      {activity.request && <div><p className="text-xs">Related request · {formatFriendlyDateRange(activity.request.startDate, activity.request.endDate, timezone)} · {activity.request.status.replaceAll('_', ' ')}</p><button type="button" className="mt-2 text-sm underline" onClick={() => onOpenRequest(activity.request._id)}>View request details →</button></div>}
      <div><h4 className="mb-2 font-medium">Ledger records</h4><ul className="space-y-3">{activity.allocations.map((allocation) => <li key={allocation.ledgerId} className="border-t pt-3 text-xs"><p className="break-all">Ledger {allocation.ledgerId} · {allocation.quantity} leave(s)</p>{allocation.policy && <p className="mt-1">{allocation.policy.name} · Version {allocation.policyVersion}</p>}<p>{scopeLabels[allocation.policySource] || 'Historical policy source not recorded'}</p>{allocation.period && <p>Entitlement period: {allocation.period}</p>}{allocation.expiryDate && <p>Bucket expiry: {when(allocation.expiryDate, timezone)}</p>}{allocation.relatedEntryId && <p className="break-all">Related ledger: {allocation.relatedEntryId}</p>}</li>)}</ul></div>
    </div>}
  </dialog>;
}

export default function LeaveBalanceActivity({ workspaceId, onOpenRequest }) {
  const [params, setParams] = useSearchParams();
  const activityId = params.get('activity');
  const queryKey = JSON.stringify({ page: params.get('activityPage') || 1, activityType: params.get('activityType') || 'all', leaveTypeId: params.get('activityLeaveType') || undefined, startDate: params.get('activityStart') || undefined, endDate: params.get('activityEnd') || undefined, includeBalances: false });
  const read = useLeaveQuery('activity', JSON.parse(queryKey), leaveApi.getMyLeaveActivity);
  const data = read.isError ? null : read.data, loading = read.isPending;
  const error = read.error?.response?.data?.message || (read.isError ? 'Unable to load balance activity.' : '');
  const load = () => read.refetch();
  const update = (changes) => setParams((previous) => {
    const next = new URLSearchParams(previous); next.delete('activityPage');
    for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, String(value)); else next.delete(key); } return next;
  });
  return <div className="space-y-4">
    <form key={queryKey} className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); update(Object.fromEntries(new FormData(event.currentTarget))); }}>
      <label className="grid min-w-36 gap-1 text-xs">Activity<select name="activityType" defaultValue={params.get('activityType') || 'all'} className="rounded-lg border bg-transparent px-3 py-2 text-sm">{TYPES.map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label>
      <label className="grid min-w-36 gap-1 text-xs">Leave type<select name="activityLeaveType" defaultValue={params.get('activityLeaveType') || ''} className="rounded-lg border bg-transparent px-3 py-2 text-sm"><option value="">All leave types</option>{data?.leaveTypes.map((type) => <option key={type._id} value={type._id}>{type.name}</option>)}</select></label>
      <label className="grid gap-1 text-xs">From<input type="date" name="activityStart" defaultValue={params.get('activityStart') || ''} className="rounded-lg border bg-transparent px-3 py-2 text-sm" /></label><label className="grid gap-1 text-xs">To<input type="date" name="activityEnd" defaultValue={params.get('activityEnd') || ''} className="rounded-lg border bg-transparent px-3 py-2 text-sm" /></label>
      <button type="submit" className="rounded-lg border px-3 py-2 text-sm">Apply</button><button type="button" onClick={load} disabled={loading} className="px-3 py-2 text-sm">Refresh</button>
    </form>
    {error && <p role="alert" className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}
    {loading ? <p role="status" className="py-6 text-center text-sm">Loading balance activity…</p> : !error && (!data?.activities.length ? <p className="py-6 text-center text-sm">No balance activity matches these filters.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b text-xs" style={{ color: 'var(--color-text-muted)' }}>{['Date & Time', 'Activity', 'Leave Type', 'Count', 'Source / Performed By', 'Details'].map((label) => <th key={label} className="px-2 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{data.activities.map((activity) => <tr key={activity.id} className="border-b last:border-0" style={{ borderColor: 'var(--color-border-subtle)' }}><td className="px-2 py-4 text-xs">{when(activity.occurredAt, data.timezone)}</td><td className="px-2 py-4"><span className="text-xs font-semibold" style={{ color: `var(--color-${toneFor(activity.category)}-text, var(--color-text-primary))` }}>{activity.label}</span>{activity.reason && <p className="mt-1 max-w-64 break-words text-xs" style={{ color: 'var(--color-text-muted)' }}>{activity.reason}</p>}</td><td className="px-2 py-4 text-xs">{activity.leaveType?.name || 'Historical leave type'}</td><td className="whitespace-nowrap px-2 py-4 font-semibold">{formatActivityQuantity(activity)}</td><td className="px-2 py-4 text-xs">{activity.source}{activity.allocations[0]?.period && <p className="mt-1">{activity.allocations[0].period}</p>}</td><td className="px-2 py-4"><button type="button" className="text-xs underline" aria-label={`View ${activity.label} details`} onClick={() => update({ activity: activity.id, activityPage: params.get('activityPage') })}>View Details</button></td></tr>)}</tbody></table></div>)}
    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Manual debits, expiry and reservations are separate from Used. Consumption follows the existing approval rules. Reservation and consumption amounts must not be added together.</p>
    {data?.carryForwardNote && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{data.carryForwardNote}</p>}
    {data && <div className="flex items-center justify-end gap-3 text-sm"><button type="button" disabled={loading || data.page <= 1} onClick={() => update({ activityPage: data.page - 1 })}>Previous</button><span>Page {data.page} of {Math.max(1, Math.ceil(data.total / data.limit))}</span><button type="button" disabled={loading || data.page * data.limit >= data.total} onClick={() => update({ activityPage: data.page + 1 })}>Next</button></div>}
    {activityId && <ActivityDetails key={activityId} activityId={activityId} workspaceId={workspaceId} timezone={data?.timezone} onClose={() => update({ activity: null, activityPage: params.get('activityPage') })} onOpenRequest={onOpenRequest} />}
  </div>;
}
