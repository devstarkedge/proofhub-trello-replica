import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as leaveApi from '../../services/leaveApi';
import LeaveRequestList from './LeaveRequestList';
import { LEAVE_SCOPE_REFRESH_EVENTS } from '../../utils/leaveRequestSync';
import useLeaveQuery from '../../hooks/useLeaveQuery';
const LeaveRequestDetails = lazy(() => import('./LeaveRequestDetails'));

const CARDS = [['pending', 'Pending Requests'], ['approved', 'Approved Requests'], ['rejected', 'Rejected Requests'], ['cancelled', 'Cancelled Requests'], ['today', 'On Leave Today']];
const inputClass = 'min-w-0 rounded-lg border bg-transparent px-3 py-2 text-sm';

export default function LeaveRequestCenter({ workspaceId, personal = false, renderDetails = true }) {
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const view = personal ? 'mine' : params.get('view') || 'all', status = params.get('status') || 'all';
  const requestId = params.get('request');
  const query = new URLSearchParams();
  for (const key of ['status', 'view', 'page', 'limit', 'after', 'departmentId', 'employeeId', 'leaveTypeId', 'startDate', 'endDate', 'q', 'sort']) if (params.has(key)) query.set(key, params.get(key));
  query.set('status', status); query.set('view', view);
  const queryKey = query.toString();
  const records = useLeaveQuery('records', { ...Object.fromEntries(new URLSearchParams(queryKey)), includeSummary: false }, leaveApi.getDashboardRecords);
  const statistics = useLeaveQuery('summary', {}, leaveApi.getDashboardSummary, { enabled: !personal });
  const data = records.isError ? null : records.data, loading = records.isPending;
  const summary = statistics.isError ? null : statistics.data?.summary;
  const error = records.error?.response?.data?.message || (records.isError ? 'Unable to load leave requests. Use Refresh to retry.' : '');
  const load = () => { records.refetch(); if (!personal) statistics.refetch(); };
  useEffect(() => {
    const resetFilters = (event) => {
      if (event.detail?.workspaceId && String(event.detail.workspaceId) !== String(workspaceId)) return;
      setParams((previous) => {
        const next = new URLSearchParams(previous);
        for (const key of ['page', 'after', 'departmentId', 'employeeId']) next.delete(key);
        return next;
      }, { replace: true });
    };
    LEAVE_SCOPE_REFRESH_EVENTS.forEach((event) => window.addEventListener(event, resetFilters));
    return () => LEAVE_SCOPE_REFRESH_EVENTS.forEach((event) => window.removeEventListener(event, resetFilters));
  }, [workspaceId, setParams]);
  const update = (changes) => setParams((previous) => {
    const next = new URLSearchParams(previous); next.delete('page');
    if (Object.keys(changes).some((key) => !['request', 'page', 'after'].includes(key))) next.delete('after');
    for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, String(value)); else next.delete(key); }
    return next;
  });
  const tabs = [['all', 'All Requests'], ...(data?.filters.canApprove ? [['approval', 'Needs My Approval']] : []), ...(data?.filters.canViewMine ? [['mine', 'My Requests']] : []), ['history', 'History']];
  return <section className="space-y-6">
    {!personal && <><div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{CARDS.map(([key, label]) => <button key={key} type="button" aria-pressed={status === key} onClick={() => update({ status: status === key ? 'all' : key, view: 'all' })} className="rounded-xl border p-4 text-left" style={{ backgroundColor: 'var(--color-card-bg)', borderColor: status === key ? 'var(--color-primary-600)' : 'var(--color-border-default)' }}><span className="block text-2xl font-bold">{summary?.[key] ?? '—'}</span><span className="mt-1 block text-xs" style={{ color: 'var(--color-text-muted)' }}>{label}</span></button>)}</div>{statistics.isError && <p role="alert" className="text-sm">Unable to load statistics. <button type="button" className="underline" onClick={() => statistics.refetch()}>Retry</button></p>}</>}
    <div className={personal ? '' : 'rounded-2xl border p-4 sm:p-5'} style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)' }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">{personal ? 'Leave Requests' : 'Leave Request Center'}</h2><p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>{personal ? 'Your personal requests' : !data ? 'Leave requests' : data.visibility === 'workspace' ? 'Workspace requests' : data.visibility === 'department' ? 'Managed departments and your requests' : 'Your personal requests'}{data ? ` · ${data.total} requests` : ''}</p></div><div className="flex gap-2"><button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)} className="rounded-lg border px-3 py-2 text-xs">Filters</button><button type="button" disabled={records.isFetching} onClick={load} className="rounded-lg border px-3 py-2 text-xs">{records.isFetching && data ? 'Updating…' : 'Refresh'}</button></div></div>
      {!personal && <div className="mb-4 flex flex-wrap gap-2" aria-label="Request views">{tabs.map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => update({ view: key, status: 'all' })} className="rounded-full px-3 py-1.5 text-xs font-medium" style={{ backgroundColor: view === key ? 'var(--color-primary-subtle)' : 'var(--color-bg-muted)', color: view === key ? 'var(--color-primary-600)' : 'var(--color-text-secondary)' }}>{label}</button>)}</div>}
      {filtersOpen && <form className="mb-4 grid grid-cols-1 gap-3 rounded-xl border p-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); update(values); }} key={queryKey}>
        <label className="grid gap-1 text-xs">Status<select name="status" defaultValue={status} className={inputClass}>{[['all', 'All statuses'], ...CARDS, ['cancellation', 'Pending cancellation']].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        {!personal && data?.filters.canFilterPeople && <><label className="grid gap-1 text-xs">Employee search<input name="q" defaultValue={params.get('q') || ''} placeholder="Name, email or employee number" maxLength={100} className={inputClass} /></label><label className="grid gap-1 text-xs">Department<select name="departmentId" defaultValue={params.get('departmentId') || ''} className={inputClass}><option value="">All authorized departments</option>{data.filters.departments.map((department) => <option key={department._id} value={department._id}>{department.name}</option>)}</select></label></>}
        <label className="grid gap-1 text-xs">Leave type<select name="leaveTypeId" defaultValue={params.get('leaveTypeId') || ''} className={inputClass}><option value="">All leave types</option>{data?.filters.leaveTypes.map((type) => <option key={type._id} value={type._id}>{type.name}</option>)}</select></label>
        <label className="grid gap-1 text-xs">From<input type="date" name="startDate" defaultValue={params.get('startDate') || ''} className={inputClass} /></label><label className="grid gap-1 text-xs">To<input type="date" name="endDate" defaultValue={params.get('endDate') || ''} className={inputClass} /></label>
        <label className="grid gap-1 text-xs">Sort<select name="sort" defaultValue={params.get('sort') || 'newest'} className={inputClass}><option value="newest">Newest request first</option><option value="oldest">Oldest request first</option><option value="leave_date">Leave date</option></select></label>
        <div className="flex items-end gap-2"><button type="submit" className="rounded-lg border px-3 py-2 text-sm">Apply filters</button><button type="button" className="px-2 py-2 text-sm" onClick={() => setParams(requestId ? { request: requestId } : {})}>Reset</button></div>
      </form>}
      {!personal && <p className="mb-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>Approved counts include leave awaiting cancellation review. On Leave Today counts distinct employees with approved, consuming leave on the workspace date.</p>}
      {error && <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}
      {loading ? <p role="status" className="py-8 text-center text-sm">Loading leave requests…</p> : !error && <LeaveRequestList requests={data?.requests || []} showRequester={!personal} timezone={data?.timezone} onSelect={(request) => update({ request: request._id, page: params.get('page') })} />}
      {data && <div className="mt-4 flex items-center justify-end gap-3 text-sm"><button type="button" disabled={loading || data.page <= 1} onClick={() => update({ page: data.page - 1, after: null })}>Previous</button><span>Page {data.page} of {Math.max(1, Math.ceil(data.total / data.limit))}</span><button type="button" disabled={loading || data.page * data.limit >= data.total} onClick={() => update({ page: data.page + 1, after: data.nextCursor })}>Next</button></div>}
    </div>
    {renderDetails && requestId && <Suspense fallback={<p role="status">Opening request…</p>}><LeaveRequestDetails key={requestId} requestId={requestId} workspaceId={workspaceId} onClose={() => update({ request: null, page: params.get('page') })} onChanged={load} /></Suspense>}
  </section>;
}
