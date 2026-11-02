import { labels, statusTone, controlClass, inputStyle, mutedStyle } from '../../hooks/useTeamAttendanceReport';
export function TeamStatus({ day }) {
  const status = day?.displayStatus || 'UNKNOWN';
  return <span className="inline-flex flex-wrap items-center gap-1"><span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${statusTone(status)}`}>{labels[status] || status}</span>
    {day?.leaveState && !['NONE', 'FULL_LEAVE'].includes(day.leaveState) && <span className="text-xs text-sky-700 dark:text-sky-300">{labels[day.leaveState]}</span>}
    {day?.presenceState === 'MISSING_CHECKOUT' && status !== 'MISSING_CHECKOUT' && <span className="text-xs text-violet-700 dark:text-violet-300">Missing checkout</span>}
    {day?.activeSession && <span className="text-xs text-blue-600 dark:text-blue-300">In progress</span>}</span>;
}
export function Rate({ rate }) {
  return <span title={rate?.reason || 'Full-period presence credit ÷ required attendance after approved leave'} className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${rate?.value == null ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'}`}>{rate?.value == null ? 'N/A' : `${rate.value}%`}</span>;
}
export function ReadState({ read, children, retry }) {
  if (read.loading) return <div role="status" className="animate-pulse rounded-xl border p-8 text-center text-sm" style={mutedStyle}>Loading attendance…</div>;
  if (read.error) return <div role="alert" className="rounded-xl border border-rose-300 p-5 text-sm"><p>{read.error}</p><button className={`${controlClass} mt-3`} style={inputStyle} onClick={retry}>Try again</button></div>;
  if (!read.data) return <p className="p-6 text-sm" style={mutedStyle}>No attendance information available.</p>;
  return children;
}
