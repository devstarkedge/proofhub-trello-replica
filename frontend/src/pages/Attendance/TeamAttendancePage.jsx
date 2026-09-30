import React, { useContext, useEffect, useState } from 'react';
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

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

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
const TeamAttendancePage = () => {
  const { currentWorkspace } = useContext(WorkspaceContext) || {};
  const [access, setAccess] = useState(undefined);
  const [startDate, setStartDate] = useState(todayKey());
  const [endDate, setEndDate] = useState(todayKey());
  const [status, setStatus] = useState('');
  const [workMode, setWorkMode] = useState('');
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    attendanceApi.getAttendanceAccess().then(({ data }) => setAccess(data)).catch(() => setAccess({ scope: 'self' }));
  }, [currentWorkspace?._id]);

  const load = () => {
    setLoading(true);
    const params = { startDate, endDate, status: status || undefined, workMode: workMode || undefined };
    Promise.all([
      attendanceApi.getAttendanceView(params),
      attendanceApi.getAttendanceDashboard({ startDate, endDate })
    ])
      .then(([viewRes, dashboardRes]) => { setRecords(viewRes.data); setSummary(dashboardRes.data); })
      .catch(() => { setRecords([]); setSummary(null); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (access && access.scope !== 'self') load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access, startDate, endDate, status, workMode, currentWorkspace?._id]);

  useEffect(() => {
    const refresh = () => { if (access && access.scope !== 'self') load(); };
    window.addEventListener('socket-attendance-checked-in', refresh);
    window.addEventListener('socket-attendance-checked-out', refresh);
    return () => {
      window.removeEventListener('socket-attendance-checked-in', refresh);
      window.removeEventListener('socket-attendance-checked-out', refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access, startDate, endDate, status, workMode]);

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

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><label className={labelClass} style={labelStyle}>From</label><input type="date" className={`${selectClass} w-full`} style={selectStyle} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
          <div><label className={labelClass} style={labelStyle}>To</label><input type="date" className={`${selectClass} w-full`} style={selectStyle} value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} /></div>
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

        {summary && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <SummaryCard label="Members" value={summary.totalMembers} />
            <SummaryCard label="Present" value={summary.counts.PRESENT} />
            <SummaryCard label="Half Day" value={summary.counts.HALF_PRESENT} />
            <SummaryCard label="Absent" value={summary.counts.ABSENT} />
            <SummaryCard label="Missing Check-Out" value={summary.counts.MISSING_CHECKOUT} />
          </div>
        )}

        {loading ? null : !records.length ? (
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
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{Math.floor(record.workedMinutes / 60)}h {Math.round(record.workedMinutes % 60)}m</span>
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

export default TeamAttendancePage;
