import React, { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import LeaveRequestCenter from './LeaveRequestCenter';
import LeaveBalanceActivity from './LeaveBalanceActivity';
const LeaveRequestDetails = lazy(() => import('./LeaveRequestDetails'));

export default function PersonalLeaveHistory({ workspaceId, onChanged }) {
  const [params, setParams] = useSearchParams();
  const tab = params.get('historyTab') === 'activity' ? 'activity' : 'requests';
  const requestId = params.get('request');
  const update = (changes) => setParams((previous) => { const next = new URLSearchParams(previous); for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); } return next; });
  const moveTab = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'requests' : event.key === 'End' ? 'activity' : tab === 'requests' ? 'activity' : 'requests';
    update({ historyTab: next });
    document.getElementById(`history-tab-${next}`)?.focus();
  };
  return <section className="space-y-4 rounded-2xl border p-4 sm:p-5" style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-card-bg)' }}>
    <div><h2 className="text-base font-semibold">Requests and History</h2><p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>Track your requests and leave balance changes.</p></div>
    <div role="tablist" aria-label="Personal leave history" className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--color-bg-muted)] p-1">{[['requests', 'Leave Requests'], ['activity', 'Balance Activity']].map(([key, label]) => <button key={key} id={`history-tab-${key}`} aria-controls={`history-panel-${key}`} role="tab" aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} type="button" onKeyDown={moveTab} onClick={() => update({ historyTab: key })} className="rounded-lg px-3 py-2 text-sm font-medium" style={{ backgroundColor: tab === key ? 'var(--color-card-bg)' : 'transparent', color: tab === key ? 'var(--color-primary-600)' : 'var(--color-text-secondary)' }}>{label}</button>)}</div>
    <div role="tabpanel" id={`history-panel-${tab}`} aria-labelledby={`history-tab-${tab}`}>
      {tab === 'requests' ? <LeaveRequestCenter workspaceId={workspaceId} personal renderDetails={false} /> : <LeaveBalanceActivity workspaceId={workspaceId} onOpenRequest={(id) => update({ request: id, activity: null })} />}
    </div>
    {requestId && <Suspense fallback={<p role="status">Opening request…</p>}><LeaveRequestDetails key={requestId} requestId={requestId} workspaceId={workspaceId} onClose={() => update({ request: null })} onChanged={() => { onChanged(); window.dispatchEvent(new CustomEvent('leave-local-change', { detail: { workspaceId } })); }} /></Suspense>}
  </section>;
}
