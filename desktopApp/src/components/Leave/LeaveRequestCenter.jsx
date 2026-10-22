import { lazy, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Ban,
  Users,
  Filter,
  RotateCw,
  Info,
  ChevronLeft,
  ChevronRight,
  Search,
  X
} from 'lucide-react';
import * as leaveApi from '../../services/leaveApi';
import LeaveRequestList from './LeaveRequestList';
import { LEAVE_SCOPE_REFRESH_EVENTS } from '../../utils/leaveRequestSync';
import useLeaveQuery from '../../hooks/useLeaveQuery';

const LeaveRequestDetails = lazy(() => import('./LeaveRequestDetails'));

const METRIC_CARDS = [
  {
    key: 'pending',
    label: 'Pending Requests',
    icon: Clock,
    colorClass: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
    activeClass: 'ring-2 ring-amber-500/40 border-amber-500 dark:border-amber-500'
  },
  {
    key: 'approved',
    label: 'Approved Requests',
    icon: CheckCircle2,
    colorClass: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    activeClass: 'ring-2 ring-emerald-500/40 border-emerald-500 dark:border-emerald-500'
  },
  {
    key: 'rejected',
    label: 'Rejected Requests',
    icon: XCircle,
    colorClass: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20',
    activeClass: 'ring-2 ring-rose-500/40 border-rose-500 dark:border-rose-500'
  },
  {
    key: 'cancelled',
    label: 'Cancelled Requests',
    icon: Ban,
    colorClass: 'text-slate-600 dark:text-slate-400 bg-slate-500/10 border-slate-500/20',
    activeClass: 'ring-2 ring-slate-500/40 border-slate-500 dark:border-slate-500'
  },
  {
    key: 'today',
    label: 'On Leave Today',
    icon: Users,
    colorClass: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    activeClass: 'ring-2 ring-indigo-500/40 border-indigo-500 dark:border-indigo-500'
  }
];

const inputClass =
  'w-full rounded-lg border bg-[var(--color-bg-base)] px-3 py-2 text-xs sm:text-sm outline-none focus:ring-1 focus:ring-indigo-500 transition-colors text-[var(--color-text-primary)] border-[var(--color-border-default)]';

export default function LeaveRequestCenter({ workspaceId, personal = false, renderDetails = true }) {
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const view = personal ? 'mine' : params.get('view') || 'all';
  const status = params.get('status') || 'all';
  const requestId = params.get('request');

  const query = new URLSearchParams();
  for (const key of [
    'status',
    'view',
    'page',
    'limit',
    'after',
    'departmentId',
    'employeeId',
    'leaveTypeId',
    'startDate',
    'endDate',
    'q',
    'sort'
  ]) {
    if (params.has(key)) query.set(key, params.get(key));
  }
  query.set('status', status);
  query.set('view', view);
  const queryKey = query.toString();

  const records = useLeaveQuery(
    'records',
    { ...Object.fromEntries(new URLSearchParams(queryKey)), includeSummary: false },
    leaveApi.getDashboardRecords
  );
  const statistics = useLeaveQuery('summary', {}, leaveApi.getDashboardSummary, { enabled: !personal });

  const data = records.isError ? null : records.data;
  const loading = records.isPending;
  const summary = statistics.isError ? null : statistics.data?.summary;
  const error = records.error?.response?.data?.message || (records.isError ? 'Unable to load leave requests. Use Refresh to retry.' : '');

  const load = () => {
    records.refetch();
    if (!personal) statistics.refetch();
  };

  useEffect(() => {
    const resetFilters = (event) => {
      if (event.detail?.workspaceId && String(event.detail.workspaceId) !== String(workspaceId)) return;
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const key of ['page', 'after', 'departmentId', 'employeeId']) next.delete(key);
          return next;
        },
        { replace: true }
      );
    };
    LEAVE_SCOPE_REFRESH_EVENTS.forEach((event) => window.addEventListener(event, resetFilters));
    return () => LEAVE_SCOPE_REFRESH_EVENTS.forEach((event) => window.removeEventListener(event, resetFilters));
  }, [workspaceId, setParams]);

  const update = (changes) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete('page');
      if (Object.keys(changes).some((key) => !['request', 'page', 'after'].includes(key))) next.delete('after');
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, String(value));
        else next.delete(key);
      }
      return next;
    });

  const tabs = [
    ['all', 'All Requests'],
    ...(data?.filters?.canApprove ? [['approval', 'Needs My Approval']] : []),
    ...(data?.filters?.canViewMine ? [['mine', 'My Requests']] : []),
    ['history', 'History']
  ];

  const hasFilterParams = ['departmentId', 'employeeId', 'leaveTypeId', 'startDate', 'endDate', 'q'].some((k) =>
    params.has(k)
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <section className="space-y-6">
      {/* 1. Executive Summary Metric Cards (Visible for managers / admins) */}
      {!personal && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
            {METRIC_CARDS.map(({ key, label, icon: Icon, colorClass, activeClass }) => {
              const isSelected = status === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => update({ status: isSelected ? 'all' : key, view: 'all' })}
                  className={`group relative rounded-2xl border p-4 text-left transition-all duration-200 cursor-pointer shadow-2xs ${
                    isSelected
                      ? `${activeClass} shadow-xs`
                      : 'hover:border-[var(--color-border-hover)] hover:shadow-xs'
                  }`}
                  style={{
                    backgroundColor: 'var(--color-card-bg)',
                    borderColor: isSelected ? undefined : 'var(--color-border-subtle)'
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)] transition-colors truncate">
                      {label}
                    </span>
                    <div className={`flex h-8 w-8 items-center justify-center rounded-xl border flex-shrink-0 ${colorClass}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
                      {summary?.[key] ?? '0'}
                    </span>
                    {isSelected && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary-600)] bg-[var(--color-primary-subtle)] px-1.5 py-0.5 rounded">
                        Filtered
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {statistics.isError && (
            <div
              role="alert"
              className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-xs text-red-600 dark:text-red-400"
            >
              <span>Unable to load leave statistics.</span>
              <button
                type="button"
                className="font-semibold underline cursor-pointer hover:opacity-80"
                onClick={() => statistics.refetch()}
              >
                Retry
              </button>
            </div>
          )}
        </>
      )}

      {/* 2. Main Leave Request Center Card */}
      <div
        className={personal ? '' : 'rounded-2xl border p-4 sm:p-6 shadow-2xs'}
        style={{
          backgroundColor: 'var(--color-card-bg)',
          borderColor: 'var(--color-border-subtle)'
        }}
      >
        {/* Header Bar */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--color-border-subtle)]">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-[var(--color-text-primary)]">
                {personal ? 'My Leave Requests' : 'Leave Requests'}
              </h2>
              {data && (
                <span className="rounded-full bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-text-secondary)]">
                  {data.total} {data.total === 1 ? 'request' : 'requests'}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {personal
                ? 'Track your submitted requests and their approval statuses.'
                : !data
                ? 'Loading workspace leave requests…'
                : data.visibility === 'workspace'
                ? 'All workspace requests across authorized departments'
                : data.visibility === 'department'
                ? 'Requests from your managed departments'
                : 'Your personal requests'}
            </p>
          </div>

          {/* Action buttons (Filters & Refresh) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer shadow-2xs active:scale-95 ${
                filtersOpen || hasFilterParams
                  ? 'bg-[var(--color-primary-subtle)] text-[var(--color-primary-600)] border-[var(--color-primary-600)]/30'
                  : 'hover:bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'
              }`}
              style={{ borderColor: filtersOpen || hasFilterParams ? undefined : 'var(--color-border-default)' }}
            >
              <Filter className="h-3.5 w-3.5" />
              <span>Filters</span>
              {hasFilterParams && (
                <span className="h-2 w-2 rounded-full bg-[var(--color-primary-600)]" />
              )}
            </button>

            <button
              type="button"
              disabled={records.isFetching}
              onClick={load}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)] transition-all cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
              style={{ borderColor: 'var(--color-border-default)' }}
            >
              <RotateCw className={`h-3.5 w-3.5 ${records.isFetching ? 'animate-spin text-indigo-500' : ''}`} />
              <span>{records.isFetching && data ? 'Updating…' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* View Segment Tabs (All, Needs My Approval, My Requests, History) */}
        {!personal && (
          <div className="mb-4 flex items-center gap-1.5 p-1 rounded-xl bg-[var(--color-bg-subtle)] border border-[var(--color-border-subtle)] w-fit flex-wrap">
            {tabs.map(([key, label]) => {
              const active = view === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => update({ view: key, status: 'all' })}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                    active
                      ? 'bg-[var(--color-card-bg)] text-[var(--color-text-primary)] shadow-xs border border-[var(--color-border-default)]'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {/* Filter Drawer / Collapsible Form */}
        {filtersOpen && (
          <form
            className="mb-5 grid grid-cols-1 gap-3.5 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3 bg-[var(--color-bg-subtle)] animate-in slide-in-from-top-2 duration-150"
            style={{ borderColor: 'var(--color-border-subtle)' }}
            onSubmit={(event) => {
              event.preventDefault();
              const values = Object.fromEntries(new FormData(event.currentTarget));
              update(values);
            }}
            key={queryKey}
          >
            <label className="grid gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">
              Status
              <select name="status" defaultValue={status} className={inputClass}>
                {[
                  ['all', 'All statuses'],
                  ...METRIC_CARDS.map((c) => [c.key, c.label]),
                  ['cancellation', 'Pending cancellation']
                ].map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            {!personal && data?.filters?.canFilterPeople && (
              <>
                <label className="grid gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">
                  Employee Search
                  <input
                    name="q"
                    defaultValue={params.get('q') || ''}
                    placeholder="Search name, email or ID…"
                    maxLength={100}
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">
                  Department
                  <select name="departmentId" defaultValue={params.get('departmentId') || ''} className={inputClass}>
                    <option value="">All authorized departments</option>
                    {data.filters.departments?.map((department) => (
                      <option key={department._id} value={department._id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <label className="grid gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">
              Leave Type
              <select name="leaveTypeId" defaultValue={params.get('leaveTypeId') || ''} className={inputClass}>
                <option value="">All leave types</option>
                {data?.filters?.leaveTypes?.map((type) => (
                  <option key={type._id} value={type._id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">
              From Date
              <input type="date" name="startDate" defaultValue={params.get('startDate') || ''} className={inputClass} />
            </label>

            <label className="grid gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">
              To Date
              <input type="date" name="endDate" defaultValue={params.get('endDate') || ''} className={inputClass} />
            </label>

            <label className="grid gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">
              Sort Order
              <select name="sort" defaultValue={params.get('sort') || 'newest'} className={inputClass}>
                <option value="newest">Newest requests first</option>
                <option value="oldest">Oldest requests first</option>
                <option value="leave_date">Leave date</option>
              </select>
            </label>

            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2">
              <button
                type="submit"
                className="rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-xs bg-indigo-600 hover:bg-indigo-700 transition-all cursor-pointer"
              >
                Apply Filters
              </button>
              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-[var(--color-bg-muted)] transition-colors cursor-pointer text-[var(--color-text-secondary)]"
                style={{ borderColor: 'var(--color-border-default)' }}
                onClick={() => setParams(requestId ? { request: requestId } : {})}
              >
                Reset
              </button>
            </div>
          </form>
        )}

        {/* Subtle Informational Note */}
        {!personal && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)]/50 px-3.5 py-2 text-xs text-[var(--color-text-muted)]">
            <Info className="h-4 w-4 text-indigo-500 flex-shrink-0" />
            <span>
              Approved counts include leave awaiting cancellation review. &ldquo;On Leave Today&rdquo; counts distinct employees with approved leave on current workspace date.
            </span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs sm:text-sm text-red-600 dark:text-red-400"
          >
            {error}
          </div>
        )}

        {/* Request List Items */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-xs sm:text-sm text-[var(--color-text-muted)]">
            <Clock className="h-5 w-5 animate-spin text-indigo-500" />
            <span>Loading leave requests…</span>
          </div>
        ) : (
          !error && (
            <LeaveRequestList
              requests={data?.requests || []}
              showRequester={!personal}
              timezone={data?.timezone}
              onSelect={(request) => update({ request: request._id, page: params.get('page') })}
            />
          )
        )}

        {/* Clean, Modern Pagination Bar */}
        {data && data.total > 0 && (
          <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-[var(--color-border-subtle)] text-xs">
            <span className="text-[var(--color-text-muted)]">
              Showing <span className="font-semibold text-[var(--color-text-primary)]">{(data.page - 1) * data.limit + 1}</span> to{' '}
              <span className="font-semibold text-[var(--color-text-primary)]">
                {Math.min(data.page * data.limit, data.total)}
              </span>{' '}
              of <span className="font-semibold text-[var(--color-text-primary)]">{data.total}</span> requests
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={loading || data.page <= 1}
                onClick={() => update({ page: data.page - 1, after: null })}
                className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-[var(--color-bg-subtle)] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
                style={{
                  borderColor: 'var(--color-border-default)',
                  color: 'var(--color-text-secondary)'
                }}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Previous</span>
              </button>

              <span className="rounded-lg bg-[var(--color-bg-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-primary)] border border-[var(--color-border-subtle)]">
                {data.page} / {totalPages}
              </span>

              <button
                type="button"
                disabled={loading || data.page * data.limit >= data.total}
                onClick={() => update({ page: data.page + 1, after: data.nextCursor })}
                className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-[var(--color-bg-subtle)] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
                style={{
                  borderColor: 'var(--color-border-default)',
                  color: 'var(--color-text-secondary)'
                }}
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Details Slide-Over Drawer (Second-last verified compact approach) */}
      {renderDetails && requestId && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/30 backdrop-blur-xs">
              <div className="rounded-xl bg-[var(--color-card-bg)] border p-4 shadow-xl flex items-center gap-2.5 text-xs font-semibold">
                <Clock className="h-4 w-4 animate-spin text-indigo-500" />
                <span>Opening request details…</span>
              </div>
            </div>
          }
        >
          <LeaveRequestDetails
            key={requestId}
            requestId={requestId}
            workspaceId={workspaceId}
            onClose={() => update({ request: null, page: params.get('page') })}
            onChanged={load}
          />
        </Suspense>
      )}
    </section>
  );
}
