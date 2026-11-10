import { createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, RotateCcw, Search, Users, CheckCircle2, Clock3, UserX, LogOut, CalendarDays } from 'lucide-react';
import WorkspaceContext from '../../context/WorkspaceContext';
import AuthContext from '../../context/AuthContext';
import Avatar from '../../components/Avatar';
import TeamAttendanceDetails from '../../components/Attendance/TeamAttendanceDetails';
import { Rate, ReadState } from '../../components/Attendance/TeamAttendanceShared';
import { controlClass, inputStyle, panelStyle, mutedStyle, labels, useTeamRead } from '../../hooks/useTeamAttendanceReport';
import { periodDateRange, isValidDateRange } from '../../utils/workspaceDateRange';
import { formatHours } from '../../utils/duration';
import { LEAVE_REFRESH_EVENTS } from '../../utils/leaveRequestSync';
import * as attendanceApi from '../../services/attendanceApi';

const COLUMNS = [['Member', 'name'], ['Department', 'department'], ['Present', 'present'], ['Half days', 'halfDays'], ['Absent', 'absent'], ['Missing checkout', 'missingCheckout'], ['Full leave', 'leaveDays'], ['Work time', 'workSeconds'], ['Attendance rate', 'attendanceRate']];
const CARDS = [
  ['Members', 'totalMembers', Users, 'text-blue-600 bg-blue-50 dark:bg-blue-950'],
  ['Members present', 'membersPresent', CheckCircle2, 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950', 'At least one day marked Present'],
  ['Half days', 'halfDays', Clock3, 'text-amber-600 bg-amber-50 dark:bg-amber-950'],
  ['Absent days', 'absent', UserX, 'text-rose-600 bg-rose-50 dark:bg-rose-950'],
  ['Missing checkout', 'missingCheckout', LogOut, 'text-violet-600 bg-violet-50 dark:bg-violet-950']
];
const ATTENDANCE_EVENTS = ['socket-attendance-checked-in', 'socket-attendance-checked-out', 'socket-attendance-updated', 'socket-attendance-regularization-decided', 'socket-attendance-regularization-requested', 'socket-attendance-work-mode-override-updated', 'socket-attendance-office-hours-override-updated', 'socket-attendance-policy-updated', 'socket-workspace-updated', 'socket-workspace-rejected', 'tracking-local-change', ...LEAVE_REFRESH_EVENTS];

function TeamAttendanceContent({ workspace, identity }) {
  const timezone = workspace.timezone || 'Asia/Kolkata';
  const defaultRange = useCallback(() => periodDateRange('month', { timezone, weekStartsOn: workspace.weekStartsOn ?? 0 }), [timezone, workspace.weekStartsOn]);
  const [period, setPeriod] = useState('month'), [range, setRange] = useState(defaultRange);
  const [status, setStatus] = useState(''), [workMode, setWorkMode] = useState(''), [departmentId, setDepartmentId] = useState('');
  const [searchInput, setSearchInput] = useState(''), [search, setSearch] = useState('');
  const [sort, setSort] = useState('name'), [direction, setDirection] = useState('asc'), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(25);
  const [revision, setRevision] = useState(0), [selectedUserId, setSelectedUserId] = useState(null), [exporting, setExporting] = useState(false), [exportError, setExportError] = useState('');
  const [departments, setDepartments] = useState([]);
  const [accessRevision, setAccessRevision] = useState(0);
  const exportController = useRef(null), valid = isValidDateRange(range.startDate, range.endDate);
  useEffect(() => { const timer = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300); return () => clearTimeout(timer); }, [searchInput]);
  const query = useMemo(() => ({ ...range, status, workMode, departmentId, search, sort, direction, page, pageSize }), [range, status, workMode, departmentId, search, sort, direction, page, pageSize]);
  const load = useCallback(signal => valid ? attendanceApi.getTeamAttendance(query, signal) : Promise.resolve({ data: null }), [query, valid]);
  const read = useTeamRead(JSON.stringify([query, revision]), load, identity, JSON.stringify([query, accessRevision])), data = read.data;
  useEffect(() => { if (data) setDepartments(data.filters.departments); else if (read.forbidden) setDepartments([]); }, [data, read.forbidden]);
  const refresh = useCallback(() => {
    if (period !== 'custom') {
      const next = periodDateRange(period, { timezone, weekStartsOn: workspace.weekStartsOn ?? 0 });
      if (next.startDate !== range.startDate || next.endDate !== range.endDate) { setRange(next); setPage(1); }
    }
    setRevision(v => v + 1); setExportError('');
  }, [period, timezone, workspace.weekStartsOn, range.startDate, range.endDate]);
  const close = useCallback(() => setSelectedUserId(null), []);
  const lostAccess = useCallback(() => { setSelectedUserId(null); setDepartments([]); setAccessRevision(v => v + 1); setRevision(v => v + 1); }, []);
  useEffect(() => {
    let timer;
    const invalidate = event => {
      if (event.detail?.workspaceId && String(event.detail.workspaceId) !== String(workspace._id)) return;
      exportController.current?.abort();
      if (/authz|access|role|assigned|rejected|permission|membership|department/.test(event.type)) { setSelectedUserId(null); setAccessRevision(v => v + 1); setRevision(v => v + 1); }
      else { clearTimeout(timer); timer = setTimeout(refresh, 120); }
    };
    ATTENDANCE_EVENTS.forEach(event => window.addEventListener(event, invalidate));
    const realtime = event => {
      const { type = '', payload = {} } = event.detail || {};
      if (!/^(tracking:|attendance:|leave:)|role|permission|department|membership|access/.test(type)) return;
      invalidate({ type, detail: payload });
    };
    const storage = event => { if (['token', 'workspaceId'].includes(event.key)) { close(); refresh(); } };
    window.addEventListener('flowtask:realtime', realtime);
    window.addEventListener('flowtask:tracking-refresh', refresh);
    window.addEventListener('storage', storage);
    const poll = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 60000);
    return () => { clearTimeout(timer); clearInterval(poll); exportController.current?.abort(); ATTENDANCE_EVENTS.forEach(event => window.removeEventListener(event, invalidate)); window.removeEventListener('flowtask:realtime', realtime); window.removeEventListener('flowtask:tracking-refresh', refresh); window.removeEventListener('storage', storage); };
  }, [workspace._id, refresh, close]);
  const filter = setter => event => { setter(event.target.value); setPage(1); setExportError(''); };
  const preset = event => { const value = event.target.value; setPeriod(value); setPage(1); if (value !== 'custom') setRange(periodDateRange(value, { timezone, weekStartsOn: workspace.weekStartsOn ?? 0 })); };
  const editDate = field => event => { setPeriod('custom'); setRange(previous => ({ ...previous, [field]: event.target.value })); setPage(1); };
  const reset = () => { setPeriod('month'); setRange(defaultRange()); setStatus(''); setWorkMode(''); setDepartmentId(''); setSearchInput(''); setSearch(''); setSort('name'); setDirection('asc'); setPage(1); close(); };
  const changeSort = key => { if (sort === key) setDirection(value => value === 'asc' ? 'desc' : 'asc'); else { setSort(key); setDirection('asc'); } setPage(1); };
  const exportCsv = async format => {
    if (!format || exporting) return;
    if (String(identity.workspaceId) !== localStorage.getItem('workspaceId') || identity.token !== localStorage.getItem('token')) return;
    setExporting(true); setExportError('');
    const controller = new AbortController(); exportController.current = controller;
    try {
      const blob = await attendanceApi.exportTeamAttendance({ ...query, format }, controller.signal);
      if (controller.signal.aborted || String(identity.workspaceId) !== localStorage.getItem('workspaceId') || identity.token !== localStorage.getItem('token')) return;
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `attendance-${format}-${range.startDate}-to-${range.endDate}.csv`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (!controller.signal.aborted) {
        let message = 'Unable to export attendance. Please retry.';
        if (error.response?.data instanceof Blob) { try { message = JSON.parse(await error.response.data.text()).message || message; } catch { /* Invalid server error payload. */ } }
        setExportError(message);
      }
    } finally { if (exportController.current === controller) { setExporting(false); exportController.current = null; } }
  };
  return <div className="space-y-5"><section className="overflow-hidden rounded-2xl border shadow-sm" style={panelStyle}>
    <div className="border-b p-4 sm:p-5" style={{ borderColor: 'var(--color-border-subtle)' }}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-2.5 text-blue-600 dark:bg-blue-950"><Users size={23} /></span><div><h1 className="text-lg font-semibold">{data?.scope === 'department' ? 'Department Attendance' : 'Team Attendance'}</h1><p className="mt-1 text-xs sm:text-sm" style={mutedStyle}>A clear view of your team, one member at a time.</p></div></div>
        <div className="flex items-center gap-2">{data?.permissions?.canViewReports && <label><span className="sr-only">Export attendance CSV</span><span className="relative block"><Download className="pointer-events-none absolute left-3 top-3" size={16} /><select aria-label="Export attendance CSV" className={`${controlClass} max-w-48 pl-9`} style={inputStyle} disabled={read.loading || !valid || exporting} value="" onChange={event => exportCsv(event.target.value)}><option value="">{exporting ? 'Exporting…' : 'Export CSV'}</option><option value="summary">User summary</option><option value="daily">Daily records</option></select></span></label>}
          <button aria-label="Refresh attendance" title="Refresh attendance" className={controlClass} style={inputStyle} onClick={refresh} disabled={read.loading || !valid}><RotateCcw size={17} className={read.loading || read.refreshing ? 'animate-spin' : ''} /></button></div></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <label className="text-xs font-medium"><span className="mb-1.5 block" style={mutedStyle}>Period</span><select className={`${controlClass} w-full`} style={inputStyle} value={period} onChange={preset}>{[['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['year', 'This Year'], ['custom', 'Custom Range']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-xs font-medium"><span className="mb-1.5 block" style={mutedStyle}>From</span><input aria-label="Start date" type="date" value={range.startDate} onChange={editDate('startDate')} className={`${controlClass} w-full min-w-0`} style={inputStyle} /></label>
        <label className="text-xs font-medium"><span className="mb-1.5 block" style={mutedStyle}>To</span><input aria-label="End date" type="date" min={range.startDate} value={range.endDate} onChange={editDate('endDate')} className={`${controlClass} w-full min-w-0`} style={inputStyle} /></label>
        <label className="text-xs font-medium"><span className="mb-1.5 block" style={mutedStyle}>Status</span><select className={`${controlClass} w-full`} style={inputStyle} value={status} onChange={filter(setStatus)}><option value="">All statuses</option>{(data?.filters.statuses || ['PRESENT', 'HALF_PRESENT', 'ABSENT', 'MISSING_CHECKOUT', 'NOT_STARTED', 'ON_LEAVE', 'HOLIDAY', 'WEEKLY_OFF']).map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label>
        <label className="text-xs font-medium"><span className="mb-1.5 block" style={mutedStyle}>Work mode</span><select className={`${controlClass} w-full`} style={inputStyle} value={workMode} onChange={filter(setWorkMode)}><option value="">All work modes</option>{['OFFICE', 'WFH', 'HYBRID', 'FIELD'].map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label>
        <label className="text-xs font-medium"><span className="mb-1.5 block" style={mutedStyle}>Department</span><select className={`${controlClass} w-full`} style={inputStyle} value={departmentId} onChange={filter(setDepartmentId)}><option value="">All departments</option>{departments.map(department => <option key={department._id} value={department._id}>{department.name}</option>)}</select></label>
        <div className="flex items-end"><button onClick={reset} className={`${controlClass} w-full`} style={inputStyle}>Reset filters</button></div>
      </div>{!valid && <p role="alert" className="mt-3 text-sm text-rose-600">Choose valid dates in order, spanning at most 3660 days.</p>}{exportError && <p role="alert" className="mt-3 text-sm text-rose-600">{exportError}</p>}
    </div>
    {data && <div className="grid grid-cols-2 gap-3 border-b p-4 sm:p-5 lg:grid-cols-5" style={{ borderColor: 'var(--color-border-subtle)' }}>
      {CARDS.map(([label, key, Icon, tone, hint]) => <div key={key} className="flex items-center gap-3 rounded-xl border p-3" style={{ ...inputStyle, borderColor: 'var(--color-border-subtle)' }}>
        <span className={`rounded-xl p-2 ${tone}`}>{createElement(Icon, { size: 21 })}</span>
        <div><p className="text-xs" style={mutedStyle}>{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{data.totals[key] ?? '—'}</p>
          {hint && <p className="text-xs" style={mutedStyle}>{hint}</p>}
        </div>
      </div>)}
    </div>}
    <div className="p-4 sm:p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays size={17} className="text-blue-600" />Team overview</h2><label className="relative w-full sm:w-80"><Search className="absolute left-3 top-3" size={16} style={mutedStyle} /><input aria-label="Search members by name or email" placeholder="Search by name or email…" value={searchInput} onChange={event => setSearchInput(event.target.value)} maxLength={120} className={`${controlClass} w-full pl-9`} style={inputStyle} /></label></div>
      {valid && <ReadState read={read} retry={refresh}>{data && <>
        {!data.rows.length ? <div className="rounded-xl border border-dashed px-5 py-12 text-center" style={{ borderColor: 'var(--color-border-default)' }}><Users className="mx-auto mb-3" size={28} style={mutedStyle} /><h3 className="font-semibold">No members match these filters</h3><p className="mt-2 text-sm" style={mutedStyle}>Try another period, status, work mode, or department.</p></div> : <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--color-border-default)' }}><table className="w-full text-left text-sm"><thead style={inputStyle}><tr>{COLUMNS.map(([label, key]) => <th key={key} scope="col" aria-sort={sort === key ? direction === 'asc' ? 'ascending' : 'descending' : 'none'} className="whitespace-nowrap px-3 py-3 text-xs font-medium"><button onClick={() => changeSort(key)} className="inline-flex items-center gap-1.5">{label}{sort === key && (direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</button></th>)}<th scope="col" className="px-2"><span className="sr-only">Details</span></th></tr></thead><tbody>{data.rows.map(row => <tr key={row.user._id} className={`border-t transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-950/30 ${selectedUserId === row.user._id ? 'bg-blue-50/60 dark:bg-blue-950/40' : ''}`} style={{ borderColor: 'var(--color-border-subtle)' }}>
          <td className="min-w-56 px-3 py-3"><button className="flex w-full items-center gap-2.5 text-left" onClick={() => setSelectedUserId(row.user._id)}><Avatar src={row.user.avatar} name={row.user.name || ''} size="sm" showBadge={false} /><span className="min-w-0"><span className="block font-semibold">{row.user.name || 'Member details unavailable'}</span><span className="block text-xs" style={mutedStyle}>{row.user.email || 'Email unavailable'}{row.historical ? ' · Historical' : ''}</span></span></button></td>
          <td className="min-w-32 px-3 py-3"><div className="flex flex-wrap gap-1">{row.departments.length ? row.departments.map(department => <span key={department._id} className="rounded-full bg-blue-50 px-2 py-1 text-[11px] text-blue-800 dark:bg-blue-950 dark:text-blue-200">{department.name}</span>) : <span style={mutedStyle}>N/A</span>}</div></td>{['present', 'halfDays', 'absent', 'missingCheckout', 'leaveDays'].map(key => <td key={key} className="px-3 py-3 text-center tabular-nums">{row[key]}</td>)}<td className="whitespace-nowrap px-3 py-3 font-medium tabular-nums">{row.workSeconds == null ? 'N/A' : formatHours(row.workSeconds / 60)}</td><td className="px-3 py-3"><Rate rate={row.attendanceRate} /></td><td className="px-2 py-3"><button aria-label={`View attendance for ${row.user.name || row.user.email || 'member'}`} onClick={() => setSelectedUserId(row.user._id)} className="rounded-lg border p-1.5" style={inputStyle}><ChevronRight size={15} /></button></td>
        </tr>)}</tbody></table></div>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs" style={mutedStyle}><p>{data.pagination.total ? `${(data.pagination.page - 1) * data.pagination.pageSize + 1}–${Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.total)} of ${data.pagination.total} members` : '0 members'} · {data.totals.membersWithRecords} with recorded days</p><div className="flex items-center gap-2"><label className="flex items-center gap-2">Rows<select aria-label="Rows per page" className={controlClass} style={inputStyle} value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50, 100].map(size => <option key={size}>{size}</option>)}</select></label><button aria-label="Previous page" disabled={data.pagination.page <= 1} className={controlClass} style={inputStyle} onClick={() => setPage(data.pagination.page - 1)}><ChevronLeft size={16} /></button><span>{data.pagination.page} / {data.pagination.pageCount}</span><button aria-label="Next page" disabled={data.pagination.page >= data.pagination.pageCount} className={controlClass} style={inputStyle} onClick={() => setPage(data.pagination.page + 1)}><ChevronRight size={16} /></button></div></div>
        <div className="mt-4 rounded-xl border p-3 text-xs leading-relaxed" style={{ ...inputStyle, borderColor: 'var(--color-border-subtle)' }}><p>{data.coverageNotice}</p><p className="mt-1" style={mutedStyle}>Attendance rate adjusts for approved leave and uses the selected dates regardless of status and work mode. Times use {data.timezone}. Running attendance is provisional, as of {new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: data.timezone }).format(new Date(data.asOf))}.</p></div>
      </>}</ReadState>}
    </div>
  </section>{selectedUserId && valid && !read.forbidden && <TeamAttendanceDetails key={selectedUserId} userId={selectedUserId} query={query} revision={revision} timezone={timezone} identity={identity} onClose={close} onForbidden={lostAccess} />}</div>;
}

export default function TeamAttendancePage() {
  const { currentWorkspace } = useContext(WorkspaceContext) || {}, { user, token } = useContext(AuthContext) || {};
  const identity = useMemo(() => ({ workspaceId: currentWorkspace?._id, token }), [currentWorkspace?._id, token]);
  if (!currentWorkspace?._id || !user?._id) return null;
  return <TeamAttendanceContent key={`${currentWorkspace._id}:${currentWorkspace.timezone}:${user._id}:${token}:${user.role}:${user.roleId}`} workspace={currentWorkspace} identity={identity} />;
}
