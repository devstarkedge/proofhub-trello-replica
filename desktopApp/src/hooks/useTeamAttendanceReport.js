import { useEffect, useRef, useState } from 'react';
export const panelStyle = { backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' };
export const inputStyle = { backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' };
export const mutedStyle = { color: 'var(--color-text-muted)' };
export const controlClass = 'min-h-10 rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50';
export const labels = { PRESENT: 'Present', HALF_PRESENT: 'Half day', SHORT_PRESENT: 'Short leave (attendance)', ABSENT: 'Absent', MISSING_CHECKOUT: 'Missing checkout', NOT_STARTED: 'Not started', ON_LEAVE: 'Approved leave', HOLIDAY: 'Holiday', WEEKLY_OFF: 'Non-working', UNKNOWN: 'No record', FUTURE: 'Future date', HALF_LEAVE_FIRST: 'First-half leave', HALF_LEAVE_SECOND: 'Second-half leave', SHORT_LEAVE: 'Short leave', FULL_LEAVE: 'Approved leave', OFFICE: 'Office', WFH: 'Work from home', HYBRID: 'Hybrid', FIELD: 'Field' };
const tones = { FUTURE: 'bg-transparent text-gray-400 dark:text-gray-600', NOT_STARTED: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300', PRESENT: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300', HALF_PRESENT: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300', SHORT_PRESENT: 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200', ABSENT: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300', MISSING_CHECKOUT: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300', ON_LEAVE: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300', HOLIDAY: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300', WEEKLY_OFF: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' };
export const statusTone = status => tones[status] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
// The transport owns report snapshots across route visits. A refresh of the
// same query queues behind its active read instead of canceling and restarting it.
export function useTeamRead(key, load, identity, retainKey = key, snapshot = null) {
  const active = useRef(null);
  const seed = snapshot?.data ?? null;
  const seedRef = useRef(seed); seedRef.current = seed;
  const [state, setState] = useState({ key: seed ? key : null, retainKey, data: seed, loading: !seed, refreshing: !!snapshot?.stale, error: '', forbidden: false });
  useEffect(() => {
    const current = () => !identity || String(identity.workspaceId) === localStorage.getItem('workspaceId') && identity.token === localStorage.getItem('token');
    if (!current()) return;
    let owner = active.current;
    if (owner && (owner.retainKey !== retainKey || owner.identity !== identity)) { owner.controller.abort(); owner = null; }
    if (!owner || owner.controller.signal.aborted) {
      owner = { retainKey, identity, controller: new AbortController(), flight: false, queued: false };
      active.current = owner;
    }
    const effect = {};
    owner.effect = effect; owner.key = key; owner.load = load;
    const valid = () => active.current === owner && !owner.controller.signal.aborted && current();
    const run = () => {
      if (!valid()) return;
      owner.flight = true; owner.queued = false;
      setState(previous => {
        const data = previous.retainKey === retainKey ? previous.data : seedRef.current;
        return { key: owner.key, retainKey, data, loading: !data, refreshing: true, error: '', forbidden: false };
      });
      owner.load(owner.controller.signal).then(response => {
        if (!valid()) return;
        setState({ key: owner.key, retainKey, data: response.data, loading: false, refreshing: owner.queued, error: '', forbidden: false });
      }).catch(error => {
        if (!valid()) return;
        // A transport supersession can look like a cancellation even while the
        // mounted caller is current. It must never leave an endless spinner.
        const forbidden = [401, 403, 404].includes(error.response?.status);
        if (forbidden) owner.queued = false;
        setState(previous => ({ key: owner.key, retainKey, data: forbidden ? null : previous.retainKey === retainKey ? previous.data : null,
          loading: false, refreshing: false, error: error.response?.data?.message || 'Unable to load attendance. Please retry.', forbidden }));
      }).finally(() => { owner.flight = false; if (owner.queued && valid()) run(); });
    };
    if (owner.flight) owner.queued = true;
    else run();
    return () => {
      // React runs the next same-query effect before this microtask. True
      // unmounts, changed filters and access changes still cancel promptly.
      queueMicrotask(() => { if (owner.effect === effect) owner.controller.abort(); });
    };
  }, [key, load, identity, retainKey]);
  if (identity && (String(identity.workspaceId) !== localStorage.getItem('workspaceId') || identity.token !== localStorage.getItem('token'))) return { data: null, loading: true, error: '', forbidden: false };
  return state.key === key ? state : state.retainKey === retainKey && state.data ? { ...state, refreshing: true } : seed ? { key, retainKey, data: seed, loading: false, refreshing: true, error: '', forbidden: false } : { data: null, loading: true, error: '', forbidden: false };
}
export function shiftMonth(month, delta) {
  const [year, index] = month.split('-').map(Number), date = new Date(Date.UTC(year, index - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}
export function initialAttendanceMonth(startDate, endDate, today) {
  const current = today.slice(0, 7);
  return current >= startDate.slice(0, 7) && current <= endDate.slice(0, 7) ? current : startDate.slice(0, 7);
}
export const dateLabel = key => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`));

// The drawer's calendar month owns its summary range, independently of the
// dashboard's period. Keep all existing subject and filter restrictions.
export function teamAttendanceMonthQuery(query, userId, month) {
  const end = new Date(shiftMonth(month, 1) + '-01T12:00:00Z');
  end.setUTCDate(end.getUTCDate() - 1);
  return { ...query, userId, search: '', page: 1, startDate: month + '-01', endDate: end.toISOString().slice(0, 10) };
}
