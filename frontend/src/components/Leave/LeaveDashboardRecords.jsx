import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as leaveApi from '../../services/leaveApi';
import LeaveRequestList from './LeaveRequestList';
import LeaveApprovalTimeline from './LeaveApprovalTimeline';
import LeaveStatusBadge from './LeaveStatusBadge';

const FILTERS = [['pending', 'Pending requests'], ['approved', 'Approved requests'], ['rejected', 'Rejected requests'], ['cancelled', 'Cancelled requests'], ['today', 'On Leave Today — employees']];

export default function LeaveDashboardRecords() {
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState('');
  const generation = useRef(0);
  const load = useCallback(async () => {
    const id = ++generation.current;
    setLoading(true); setError('');
    try {
      const response = await leaveApi.getDashboardRecords({ status, page });
      if (id === generation.current) {
        setData(response.data);
        if (page > 1 && !response.data.requests.length) setPage(1);
      }
    } catch (err) { if (id === generation.current) { setData(null); setError(err.response?.data?.message || 'Unable to load leave records'); } }
    finally { if (id === generation.current) setLoading(false); }
  }, [status, page]);
  useEffect(() => {
    load();
    const events = ['socket-leave-request-created', 'socket-leave-request-updated', 'socket-leave-approval-updated', 'socket-leave-calendar-updated'];
    events.forEach((event) => window.addEventListener(event, load));
    const requestGeneration = generation;
    return () => { requestGeneration.current++; events.forEach((event) => window.removeEventListener(event, load)); };
  }, [load]);
  useEffect(() => {
    let active = true;
    setDetail(null); setDetailError('');
    if (selected) leaveApi.getRequestDetail(selected._id).then(({ data: result }) => { if (active) setDetail(result); }).catch((err) => { if (active) setDetailError(err.response?.data?.message || 'Unable to load request details'); });
    return () => { active = false; };
  }, [selected]);
  return <section className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {FILTERS.map(([key, label]) => <button type="button" key={key} aria-pressed={status === key} onClick={() => { setStatus(key); setPage(1); }} className="rounded-xl border p-4 text-left" style={{ backgroundColor: 'var(--color-card-bg)', borderColor: status === key ? 'var(--color-primary-600)' : 'var(--color-border-default)' }}>
        <div className="text-2xl font-bold">{data?.summary[key] ?? '—'}</div><div className="mt-1 text-xs">{label}</div>
      </button>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-sm font-semibold">{FILTERS.find(([key]) => key === status)?.[1]} · {data?.total ?? 0} requests</h2>
      <button type="button" onClick={load} disabled={loading} className="rounded-lg border px-3 py-2 text-xs">Refresh</button>
    </div>
    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Approved includes approved leave awaiting a cancellation decision. On Leave Today counts distinct employees with approved, consuming leave on the workspace date; short leave shows its scheduled time.</p>
    {error && <p role="alert" style={{ color: 'var(--color-error-text)' }}>{error}</p>}
    {loading ? <p role="status">Loading leave records…</p> : !error && <LeaveRequestList requests={data?.requests || []} showRequester onSelect={setSelected} timezone={data?.timezone} />}
    {data && data.total > data.limit && <div className="flex items-center justify-end gap-3 text-sm">
      <button type="button" disabled={page === 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</button>
      <span>Page {page} of {Math.ceil(data.total / data.limit)}</span>
      <button type="button" disabled={page * data.limit >= data.total || loading} onClick={() => setPage((p) => p + 1)}>Next</button>
    </div>}
    {selected && <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 p-4" onClick={() => setSelected(null)}>
      <div role="dialog" aria-modal="true" aria-label="Leave request details" className="max-h-[85vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl p-6" style={{ backgroundColor: 'var(--color-card-bg)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between"><h3>{selected.requester?.name} · {selected.leaveType?.name}</h3><button type="button" onClick={() => setSelected(null)}>Close</button></div>
        <LeaveStatusBadge status={selected.status} />
        {detailError ? <p role="alert">{detailError}</p> : detail ? <><p>{detail.request.reason || 'No reason provided'}</p><LeaveApprovalTimeline approvals={detail.approvals} /></> : <p>Loading details…</p>}
      </div>
    </div>}
  </section>;
}
