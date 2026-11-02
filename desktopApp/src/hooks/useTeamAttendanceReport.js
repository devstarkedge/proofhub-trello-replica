import { useEffect, useRef, useState } from 'react';
export const panelStyle = { backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' };
export const inputStyle = { backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' };
export const mutedStyle = { color: 'var(--color-text-muted)' };
export const controlClass = 'min-h-10 rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50';
export const labels = { PRESENT: 'Present', HALF_PRESENT: 'Half day', ABSENT: 'Absent', MISSING_CHECKOUT: 'Missing checkout', NOT_STARTED: 'Not started', ON_LEAVE: 'Approved leave', HOLIDAY: 'Holiday', WEEKLY_OFF: 'Non-working', UNKNOWN: 'No record', FUTURE: 'Future date', HALF_LEAVE_FIRST: 'First-half leave', HALF_LEAVE_SECOND: 'Second-half leave', SHORT_LEAVE: 'Short leave', FULL_LEAVE: 'Approved leave', OFFICE: 'Office', WFH: 'Work from home', HYBRID: 'Hybrid', FIELD: 'Field' };
const tones = { PRESENT: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300', HALF_PRESENT: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300', ABSENT: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300', MISSING_CHECKOUT: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300', ON_LEAVE: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300', HOLIDAY: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300', WEEKLY_OFF: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' };
export const statusTone = status => tones[status] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
// Private, bounded cache lives only inside the keyed authenticated page/drawer.
// Invalidation is part of the key; old-key payloads never render while loading.
export function useTeamRead(key, load) {
  const cache = useRef(new Map());
  const [state, setState] = useState({ key: null, data: null, loading: true, error: '', forbidden: false });
  useEffect(() => {
    const controller = new AbortController(), cached = cache.current.get(key);
    if (cached && Date.now() - cached.time < 15000) {
      setState({ key, data: cached.data, loading: false, error: '', forbidden: false });
      return () => controller.abort();
    }
    setState({ key, data: null, loading: true, error: '', forbidden: false });
    load(controller.signal).then(response => {
      if (controller.signal.aborted) return;
      cache.current.set(key, { data: response.data, time: Date.now() });
      if (cache.current.size > 8) cache.current.delete(cache.current.keys().next().value);
      setState({ key, data: response.data, loading: false, error: '', forbidden: false });
    }).catch(error => {
      if (controller.signal.aborted || ['CanceledError', 'AbortError'].includes(error.name)) return;
      cache.current.clear();
      setState({ key, data: null, loading: false, error: error.response?.data?.message || 'Unable to load attendance. Please retry.', forbidden: [401, 403, 404].includes(error.response?.status) });
    });
    return () => controller.abort();
  }, [key, load]);
  return state.key === key ? state : { data: null, loading: true, error: '', forbidden: false };
}
export function shiftMonth(month, delta) {
  const [year, index] = month.split('-').map(Number), date = new Date(Date.UTC(year, index - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}
export const dateLabel = key => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`));
