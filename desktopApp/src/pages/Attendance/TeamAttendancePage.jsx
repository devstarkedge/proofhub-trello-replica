import { periodDateRange, isValidDateRange } from '../../utils/workspaceDateRange';
import { formatHours } from '../../utils/duration';
import { attendanceCsv } from '../../utils/attendanceExport';
import React, { useContext, useCallback, useEffect, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import PresenceStatusBadge from '../../components/Attendance/PresenceStatusBadge';
import LeaveEmptyState from '../../components/Leave/LeaveEmptyState';
import WorkspaceContext from '../../context/WorkspaceContext';
import * as attendanceApi from '../../services/attendanceApi';

const selectClass = 'rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]';
const selectStyle = { backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' };
const labelClass = 'mb-1 block text-xs font-medium';
const labelStyle = { color: 'var(--color-text-secondary)' };

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'PRESENT', label: 'Present' },
  { value: 'HALF_PRESENT', label: 'Half Day' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'MISSING_CHECKOUT', label: 'Missing Check-Out' },
  { value: 'NOT_STARTED', label: 'Not Started' }
];
const WORK_MODE_OPTIONS = [
  { value: '', label: 'All work modes' },
  { value: 'OFFICE', label: 'Office' },
  { value: 'WFH', label: 'Work From Home' },
  { value: 'HYBRID', label: 'Hybrid' },
  { value: 'FIELD', label: 'Field' }
];

const SummaryCard = ({ label, value }) => (
  <div className="rounded-xl border px-4 py-3" style={{ backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-subtle)' }}>
    <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
    <p className="mt-1 text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{value}</p>
  </div>
);

/**
 * Manager/HR/Admin "Team Attendance" view — backed entirely by the
 * centralized attendanceView.service.js (new spec §9-14): this component
 * applies zero role branching of its own, it only renders whatever scope
 * and records the backend's resolveAttendanceAccess/getAttendanceView
 * already decided this viewer is authorized to see. Status/work-mode
 * filters here are frontend conveniences only — the backend remains the
 * sole enforcer of WHICH records can ever be returned in the first place.
 */
const TeamAttendanceContent = () => {
  const { currentWorkspace } = useContext(WorkspaceContext) || {};
  const [access, setAccess] = useState(undefined);
  const [period, setPeriod] = useState('month');
  const [range, setRange] = useState(() => periodDateRange('month', { timezone: currentWorkspace?.timezone, weekStartsOn: currentWorkspace?.weekStartsOn ?? 0 }));
  const { startDate, endDate } = range;
  const [error, setError] = useState('');
  const generation = useRef(0);
  const validRange = isValidDateRange(startDate, endDate);
  const setPreset = (value) => {
    setPeriod(value);
    if (value !== 'custom') setRange(periodDateRange(value, { timezone: currentWorkspace?.timezone, weekStartsOn: currentWorkspace?.weekStartsOn ?? 0 }));
  };
  const editDate = (field, value) => { setPeriod('custom'); setRange((old) => ({ ...old, [field]: value })); };
  const [status, setStatus] = useState('');
  const [workMode, setWorkMode] = useState('');
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    attendanceApi.getAttendanceAccess().then(({ data }) => setAccess(data)).catch(() => setAccess({ scope: 'self' }));
  }, [currentWorkspace?._id]);

  const load = useCallback(() => {
    const id = ++generation.current;
    if (!validRange || !access || access.scope === 'self') { setRecords([]); setSummary(null); setLoading(false); return; }
    setLoading(true); setError('');
    const params = { startDate, endDate, status: status || undefined, workMode: workMode || undefined };
    Promise.all([attendanceApi.getAttendanceView(params), attendanceApi.getAttendanceDashboard(params)])
      .then(([viewRes, dashboardRes]) => { if (id === generation.current) { setRecords(viewRes.data); setSummary(dashboardRes.data); } })
      .catch((err) => { if (id === generation.current) { setRecords([]); setSummary(null); setError(err.response?.data?.message || 'Unable to load attendance'); } })
      .finally(() => { if (id === generation.current) setLoading(false); });
  }, [access, startDate, endDate, status, workMode, validRange]);

  useEffect(() => {
    load();
    const events = ['socket-attendance-checked-in', 'socket-attendance-checked-out', 'socket-attendance-regularization-updated'];
    events.forEach((event) => window.addEventListener(event, load));
    const requestGeneration = generation;
    return () => { requestGeneration.current++; events.forEach((event) => window.removeEventListener(event, load)); };
  }, [load]);

  const exportRows = () => {
    if (loading || error || !validRange) return;
    const csv = attendanceCsv(records);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'attendance-' + startDate + '-to-' + endDate + '.csv';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (access === undefined) return null;

  if (access.scope === 'self') {
    return (
      <LeaveEmptyState
        title="No team to view"
        description="You don't manage a department or hold workspace-wide Attendance access, so there's no team view to show here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border p-4 shadow-sm sm:p-6" style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)' }}>
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-4 w-4" style={{ color: 'var(--color-primary-600)' }} />
          <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {access.scope === 'workspace' ? 'Workspace Attendance' : 'Department Attendance'}
          </h2>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="text-xs">Period <select aria-label="Attendance period" className={selectClass} style={selectStyle} value={period} onChange={(e) => setPreset(e.target.value)}>
            <option value="week">This Week</option><option value="month">This Month</option><option value="year">This Year</option><option value="custom">Custom Date Range</option>
          </select></label>
          <button type="button" onClick={load} disabled={loading || !validRange} className={selectClass}>Refresh</button>
          {access.reportPermissions?.canViewReports && <button type="button" onClick={exportRows} disabled={loading || !validRange || !!error} className={selectClass}>Export CSV</button>}
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><label className={labelClass} style={labelStyle}>From</label><input type="date" aria-label="Start date" className={`${selectClass} w-full`} style={selectStyle} value={startDate} onChange={(e) => editDate('startDate', e.target.value)} /></div>
          <div><label className={labelClass} style={labelStyle}>To</label><input type="date" aria-label="End date" className={`${selectClass} w-full`} style={selectStyle} value={endDate} min={startDate} onChange={(e) => editDate('endDate', e.target.value)} /></div>
          <div>
            <label className={labelClass} style={labelStyle}>Status</label>
            <select className={`${selectClass} w-full`} style={selectStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Work Mode</label>
            <select className={`${selectClass} w-full`} style={selectStyle} value={workMode} onChange={(e) => setWorkMode(e.target.value)}>
              {WORK_MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {!validRange && <p role="alert" className="mb-3" style={{ color: 'var(--color-error-text)' }}>Choose valid dates in order, spanning at most 3660 days.</p>}
        {error && <p role="alert">{error}</p>}
        {summary && validRange && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <SummaryCard label="Members with records" value={summary.totalMembers} />
            <SummaryCard label="Present days" value={summary.counts.PRESENT} />
            <SummaryCard label="Half days" value={summary.counts.HALF_PRESENT} />
            <SummaryCard label="Absent days" value={summary.counts.ABSENT} />
            <SummaryCard label="Missing Check-Out" value={summary.counts.MISSING_CHECKOUT} />
          </div>
        )}

        {loading ? <p role="status">Loading attendance…</p> : !records.length ? (
          <LeaveEmptyState title="No attendance records for this range" compact />
        ) : (
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-border-default)' }}>
            {records.map((record) => (
              <div key={record._id} className="flex flex-col gap-1 border-b px-4 py-3 text-sm last:border-b-0 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--color-border-subtle)' }}>
                <div>
                  <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{record.user?.name || 'Unknown'}</span>
                  <span className="ml-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>{record.workDateKey} · {record.workMode}</span>
                </div>
                <div className="flex items-center gap-2">
                  {typeof record.workedMinutes === 'number' && record.workedMinutes > 0 && (
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{formatHours(record.workedMinutes)}</span>
                  )}
                  <PresenceStatusBadge status={record.presenceState} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const TeamAttendancePage = () => {
  const { currentWorkspace } = useContext(WorkspaceContext) || {};
  return <TeamAttendanceContent key={currentWorkspace?._id + ':' + currentWorkspace?.timezone} />;
};
export default TeamAttendancePage;
