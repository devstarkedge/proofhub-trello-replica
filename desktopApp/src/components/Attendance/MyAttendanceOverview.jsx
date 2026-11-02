import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, CalendarCheck, CalendarX, ChevronLeft, ChevronRight, Clock3, List, LogIn, LogOut, Monitor, Layers, Umbrella, Info, RefreshCw } from 'lucide-react';
import AuthContext from '../../context/AuthContext';
import * as attendanceApi from '../../services/attendanceApi';
import { workspaceDateKey } from '../../utils/workspaceDateRange';
import { formatHours } from '../../utils/duration';
import PresenceStatusBadge from './PresenceStatusBadge';
import { TeamStatus } from './TeamAttendanceShared';
import { attendanceDateLabel, attendanceMonthRange, attendanceTimeLabel, moveAttendanceMonth, personalAttendanceCounts, personalAttendanceDays, personalDayStatus, personalDayStyle, PERSONAL_DAY_STYLES } from './myAttendancePresentation';

const cardStyle = { backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' };
const mutedStyle = { color: 'var(--color-text-muted)' };
const controlClass = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] disabled:opacity-50';
const controlStyle = { backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' };
const workModes = { OFFICE: 'Office', WFH: 'Work from home', HYBRID: 'Hybrid', FIELD: 'Field' };
const leaveLabels = { HALF_LEAVE_FIRST: 'First half on approved leave', HALF_LEAVE_SECOND: 'Second half on approved leave', SHORT_LEAVE: 'Approved short leave' };

function DayStatus({ day }) {
  if (!day) return <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ backgroundColor: 'var(--color-bg-muted)', ...mutedStyle }}>No record</span>;
  return <PresenceStatusBadge day={day} />;
}

function DetailField({ icon, label, children }) {
  const Icon = icon;
  return <div className="flex min-w-0 items-center gap-2 rounded-lg px-3 py-2.5" style={{ backgroundColor: 'var(--color-bg-muted)' }}>
    <Icon className="h-4 w-4 shrink-0" style={mutedStyle} /><span className="text-xs" style={mutedStyle}>{label}</span><span className="ml-auto min-w-0 text-right text-xs font-semibold tabular-nums">{children}</span>
  </div>;
}

function DayDetails({ day, selectedDate, timezone, pending, error }) {
  if (pending || error) return <section className="rounded-2xl border p-4 shadow-sm sm:p-5" style={cardStyle} aria-label="Selected date attendance details"><h2 className="mb-3 text-sm font-semibold">{attendanceDateLabel(selectedDate)} · Attendance details</h2><p role={error ? 'alert' : 'status'} className="text-xs leading-relaxed" style={mutedStyle}>{error ? 'Selected-day details could not be loaded. Retry the attendance history.' : 'Loading selected-day details…'}</p></section>;
  const schedule = day?.effectiveOfficeHoursStart && day?.effectiveOfficeHoursEnd ? `${day.effectiveOfficeHoursStart} – ${day.effectiveOfficeHoursEnd}` : null;
  return <section className="rounded-2xl border p-4 shadow-sm sm:p-5" style={cardStyle} aria-label="Selected date attendance details">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">{attendanceDateLabel(selectedDate)} · Attendance details</h2><DayStatus day={day} /></div>
    <div className="grid gap-2 sm:grid-cols-2">
      <DetailField icon={LogIn} label="Check-in">{attendanceTimeLabel(day?.activeSession?.checkInAt || day?.firstCheckInAt, timezone)}</DetailField>
      <DetailField icon={Monitor} label="Work mode">{workModes[day?.workMode] || 'Unavailable'}</DetailField>
      <DetailField icon={LogOut} label="Check-out">{attendanceTimeLabel(day?.lastCheckOutAt, timezone)}</DetailField>
      <DetailField icon={Layers} label="Office hours">{schedule || 'Unavailable'}</DetailField>
      <DetailField icon={Clock3} label="Attendance time">{day?.workedMinutes != null ? formatHours(day.workedMinutes) : 'Unavailable'}</DetailField>
      <DetailField icon={CalendarCheck} label="Status">{personalDayStyle(day).label}</DetailField>
    </div>
    {leaveLabels[day?.leaveState] && <p className="mt-3 text-xs" style={{ color: 'var(--color-info-text)' }}>{leaveLabels[day.leaveState]}</p>}
    {day?.exceptionFlags?.length > 0 && <p className="mt-3 text-xs leading-relaxed" style={mutedStyle}>{day.exceptionFlags.map(flag => flag.replaceAll('_', ' ').toLowerCase()).join(' · ')}</p>}
    {day?.activeSession && <p className="mt-3 text-xs" style={{ color: 'var(--color-primary)' }}>Attendance in progress. Duration may update as your session continues.</p>}
    {!day && <p className="mt-3 text-xs leading-relaxed" style={mutedStyle}>No attendance record is available for this date. A missing record does not establish absence, leave, or a non-working day.</p>}
    <p className="mt-3 text-[11px] leading-relaxed" style={mutedStyle}>Times use {timezone}. Attendance time is separate from tracked work time.</p>
  </section>;
}

export default function MyAttendanceOverview({ today, workspace, scope, children }) {
  const { user, token } = useContext(AuthContext) || {};
  const userId = user?._id || user?.id;
  const timezone = workspace?.timezone || 'Asia/Kolkata';
  const currentDate = today.workDateKey || workspaceDateKey(new Date(), timezone);
  const [month, setMonth] = useState(() => currentDate.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(currentDate);
  const [view, setView] = useState('calendar');
  const [revision, setRevision] = useState(0);
  const [history, setHistory] = useState({ key: null, records: [], loading: true, error: '' });
  const pendingFocus = useRef(null), grid = useRef(null);
  const range = useMemo(() => attendanceMonthRange(month), [month]);
  const readKey = JSON.stringify([scope, userId, workspace?._id, token, month, revision]);

  useEffect(() => {
    let active = true, generation = 0;
    const identity = () => String(workspace?._id) === localStorage.getItem('workspaceId') && token === localStorage.getItem('token');
    const load = () => {
      const request = ++generation;
      setHistory({ key: readKey, records: [], loading: true, error: '' });
      if (!userId || !range || !identity()) { setHistory({ key: readKey, records: [], loading: false, error: 'Personal attendance history is unavailable for the current session.' }); return; }
      // Explicitly request self through the existing API. No team, dashboard,
      // policy-management or role-dependent endpoint is used for this view.
      attendanceApi.getAttendanceView({ userId, startDate: range.startDate, endDate: range.endDate }).then(({ data }) => {
        if (!active || generation !== request || !identity()) return;
        const records = data.filter(record => String(record.user?._id || record.user) === String(userId));
        setHistory({ key: readKey, records, loading: false, error: '' });
      }).catch(error => {
        if (!active || generation !== request || !identity()) return;
        setHistory({ key: readKey, records: [], loading: false, error: error.response?.data?.message || 'Unable to load your attendance history.' });
      });
    };
    load();
    const events = ['socket-attendance-checked-in', 'socket-attendance-checked-out', 'socket-attendance-missed-checkout', 'socket-attendance-updated', 'socket-attendance-regularization-decided'];
    events.forEach(event => window.addEventListener(event, load));
    return () => { active = false; generation++; events.forEach(event => window.removeEventListener(event, load)); };
  }, [readKey, userId, token, workspace?._id, range]);

  const ready = history.key === readKey;
  const loading = !ready || history.loading;
  const error = ready ? history.error : '';
  const days = useMemo(() => personalAttendanceDays(ready && !history.error ? history.records : [], today, month), [ready, history.records, history.error, today, month]);
  const dates = useMemo(() => new Map(days.map(day => [day.workDateKey, day])), [days]);
  const counts = personalAttendanceCounts(days);
  const weekStart = workspace?.weekStartsOn ?? 0;
  const first = new Date(`${month}-01T12:00:00Z`);
  const offset = (first.getUTCDay() - weekStart + 7) % 7;
  const numberOfDays = Number(range.endDate.slice(-2));
  const slots = Math.ceil((offset + numberOfDays) / 7) * 7;
  const weekdays = Array.from({ length: 7 }, (_, index) => { const date = new Date(first); date.setUTCDate(1 - first.getUTCDay() + weekStart + index); return new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }).format(date); });
  const setCalendarMonth = next => { if (attendanceMonthRange(next)) { setMonth(next); setSelectedDate(next === currentDate.slice(0, 7) ? currentDate : `${next}-01`); } };
  const selectDay = key => { setSelectedDate(key); if (key.slice(0, 7) !== month) setMonth(key.slice(0, 7)); };
  useEffect(() => { if (!loading && pendingFocus.current) { grid.current?.querySelector(`[data-attendance-date="${pendingFocus.current}"]`)?.focus(); pendingFocus.current = null; } }, [selectedDate, loading]);
  const navigateDay = event => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (!delta) return;
    event.preventDefault(); const date = new Date(`${selectedDate}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + delta);
    const key = date.toISOString().slice(0, 10); pendingFocus.current = key; selectDay(key);
  };
  const cards = [
    { label: 'Present days', value: counts.present, icon: CalendarCheck, color: 'var(--color-success-text)', background: 'var(--color-success-subtle)' },
    { label: 'Half days', value: counts.halfDays, icon: Clock3, color: 'var(--color-warning-text)', background: 'var(--color-warning-subtle)' },
    { label: 'Absent days', value: counts.absent, icon: CalendarX, color: 'var(--color-error-text)', background: 'var(--color-error-subtle)' },
    { label: 'On leave', value: counts.leave, icon: Umbrella, color: 'var(--color-info-text)', background: 'var(--color-info-subtle)' }
  ];

  const formatTime = value => {
    if (!value) return 'N/A';
    const d = new Date(value);
    return Number.isFinite(+d) ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(d) : 'N/A';
  };

  const historyDays = useMemo(() => {
    return days
      .filter(day =>
        day.hasAttendance ||
        day.activeSession ||
        day.firstCheckInAt ||
        (day.leaveState && day.leaveState !== 'NONE') ||
        (typeof day.workedMinutes === 'number' && day.workedMinutes > 0)
      )
      .sort((a, b) => b.workDateKey.localeCompare(a.workDateKey));
  }, [days]);

  return <div className="space-y-4">
    <section aria-label="Personal attendance summary" className="rounded-2xl border p-3 shadow-sm sm:p-4" style={cardStyle}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Attendance overview</h2><p className="mt-0.5 text-xs" style={mutedStyle}>Reported days · {attendanceDateLabel(`${month}-01`, { month: 'long', year: 'numeric' })}</p></div><label className="flex items-center gap-2 text-xs" style={mutedStyle}>Month<input aria-label="Attendance month" type="month" value={month} onChange={event => setCalendarMonth(event.target.value)} className={controlClass} style={controlStyle} /></label></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {cards.map(card => { const Icon = card.icon; return <div key={card.label} className="flex items-center gap-2.5 rounded-xl px-3 py-3" style={{ backgroundColor: card.background }}><Icon className="h-5 w-5 shrink-0" style={{ color: card.color }} /><div><p className="text-[11px] font-medium" style={mutedStyle}>{card.label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{loading || error ? '—' : card.value}</p></div></div>; })}
        {[['Working days', 'The complete working-day schedule is unavailable for this month.'], ['Attendance rate', 'Attendance rate is unavailable without complete attendance and schedule coverage.']].map(([label, explanation]) => <div key={label} className="flex items-center gap-2.5 rounded-xl px-3 py-3" style={{ backgroundColor: 'var(--color-bg-muted)' }}><Info className="h-5 w-5 shrink-0" style={mutedStyle} /><div><p className="text-[11px] font-medium" style={mutedStyle}>{label}</p><p title={explanation} className="mt-1 text-xl font-semibold">N/A<span className="sr-only"> · {explanation}</span></p></div></div>)}
      </div><p className="mt-3 text-[11px] leading-relaxed" style={mutedStyle}>Counts reflect available daily statuses. Dates without a record are not treated as absences. Complete working-day totals and attendance rate are unavailable.</p>
    </section>

    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <section className="min-w-0 overflow-hidden rounded-2xl border shadow-sm" style={cardStyle} aria-label="Personal attendance history">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:p-5" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <div className="flex items-center gap-2"><button type="button" aria-label="Previous attendance month" className={controlClass} style={controlStyle} onClick={() => setCalendarMonth(moveAttendanceMonth(month, -1))}><ChevronLeft size={16} /></button><h2 className="text-sm font-semibold">{attendanceDateLabel(`${month}-01`, { month: 'long', year: 'numeric' })}</h2><button type="button" aria-label="Next attendance month" className={controlClass} style={controlStyle} onClick={() => setCalendarMonth(moveAttendanceMonth(month, 1))}><ChevronRight size={16} /></button></div>
            <div className="flex items-center gap-1.5"><button type="button" title="This month" className={controlClass} style={controlStyle} onClick={() => setCalendarMonth(currentDate.slice(0, 7))}>This month</button><button type="button" aria-label="Refresh personal history" className={controlClass} style={controlStyle} onClick={() => setRevision(value => value + 1)} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button></div>
            <div role="group" aria-label="Attendance history presentation" className="inline-flex rounded-lg border p-0.5" style={{ borderColor: 'var(--color-border-default)' }}>{[['calendar', CalendarDays, 'Calendar'], ['list', List, 'List']].map(([mode, icon, label]) => { const Icon = icon; return <button key={mode} type="button" aria-pressed={view === mode} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]" style={{ backgroundColor: view === mode ? 'var(--color-primary)' : 'transparent', color: view === mode ? 'var(--color-text-on-primary)' : 'var(--color-text-secondary)' }} onClick={() => setView(mode)}><Icon size={14} />{label}</button>; })}</div>
          </header>
          {loading ? <div role="status" className="flex min-h-80 animate-pulse items-center justify-center gap-2 text-sm" style={mutedStyle}><RefreshCw className="h-4 w-4 animate-spin" />Loading your attendance…</div> : error ? <div role="alert" className="space-y-3 p-6 text-sm"><p>{error}</p><button type="button" className={controlClass} style={controlStyle} onClick={() => setRevision(value => value + 1)}>Retry history</button></div> : <>
            {view === 'calendar' ? <div className="p-3 sm:p-4" ref={grid} onKeyDown={navigateDay}>
              <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-border-default)' }}><div className="grid grid-cols-7 border-b py-3 text-center text-xs font-medium" style={{ backgroundColor: 'var(--color-bg-muted)', borderColor: 'var(--color-border-subtle)' }}>{weekdays.map(day => <span key={day}>{day}</span>)}</div>
                <div className="grid grid-cols-7">{Array.from({ length: slots }, (_, slot) => {
                  const number = slot - offset + 1;
                  if (number < 1 || number > numberOfDays) return <span aria-hidden="true" key={`empty-${slot}`} className="min-h-16 border-b border-r sm:min-h-20" style={{ backgroundColor: 'var(--color-bg-muted)', borderColor: 'var(--color-border-subtle)' }} />;
                  const key = `${month}-${String(number).padStart(2, '0')}`, day = dates.get(key), style = personalDayStyle(day);
                  return <button key={key} type="button" data-attendance-date={key} tabIndex={selectedDate === key ? 0 : -1} aria-pressed={selectedDate === key} aria-current={key === currentDate ? 'date' : undefined} aria-label={`${attendanceDateLabel(key)}: ${style.label}`} onClick={() => setSelectedDate(key)} className="flex min-h-16 flex-col items-center gap-1 border-b border-r py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-border-focus)] sm:min-h-20" style={{ borderColor: 'var(--color-border-subtle)', backgroundColor: selectedDate === key ? 'var(--color-primary-subtle)' : 'transparent', boxShadow: selectedDate === key ? 'inset 0 0 0 2px var(--color-primary)' : undefined }}>
                    <span className="text-xs font-medium tabular-nums">{number}</span>{style.short ? <span className="inline-flex h-5 min-w-6 items-center justify-center rounded-full px-1.5 text-[10px] font-bold" style={{ color: style.color, backgroundColor: style.background }}>{style.short}</span> : <span className="h-5 text-[10px]" style={mutedStyle}>—</span>}
                    {leaveLabels[day?.leaveState] && <span className="h-1 w-3 rounded-full" style={{ backgroundColor: 'var(--color-info-text)' }} />}
                  </button>;
                })}</div></div>
            </div> : !days.length ? <div className="px-5 py-12 text-center text-sm" style={mutedStyle}>No attendance records are available for this month.</div> : <div className="max-h-[34rem] overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0" style={{ backgroundColor: 'var(--color-card-bg)' }}><tr>{['Date', 'Status', 'Check-in', 'Check-out', 'Attendance time'].map(label => <th key={label} className="whitespace-nowrap px-3 py-3 font-medium" style={mutedStyle}>{label}</th>)}</tr></thead><tbody>{days.map(day => <tr key={day.workDateKey} className="border-t" style={{ borderColor: 'var(--color-border-subtle)', backgroundColor: selectedDate === day.workDateKey ? 'var(--color-primary-subtle)' : undefined }}><td className="whitespace-nowrap px-3 py-3"><button type="button" className="font-medium underline-offset-2 hover:underline" style={{ color: 'var(--color-primary)' }} onClick={() => setSelectedDate(day.workDateKey)}>{attendanceDateLabel(day.workDateKey, { day: 'numeric', month: 'short' })}</button>{day.currentStatus && <span className="mt-0.5 block text-[10px]" style={mutedStyle}>Current status</span>}</td><td className="px-3 py-3"><DayStatus day={day} /></td><td className="whitespace-nowrap px-3 py-3">{attendanceTimeLabel(day.activeSession?.checkInAt || day.firstCheckInAt, timezone)}</td><td className="whitespace-nowrap px-3 py-3">{attendanceTimeLabel(day.lastCheckOutAt, timezone)}</td><td className="whitespace-nowrap px-3 py-3 tabular-nums">{day.workedMinutes != null ? formatHours(day.workedMinutes) : 'Unavailable'}</td></tr>)}</tbody></table></div>}
            <div className="flex flex-wrap gap-x-3 gap-y-2 border-t p-4" style={{ borderColor: 'var(--color-border-subtle)' }}>{['PRESENT', 'HALF_PRESENT', 'ABSENT', 'ON_LEAVE', 'MISSING_CHECKOUT', 'HOLIDAY', 'WEEKLY_OFF', 'LATE', 'NOT_STARTED', 'UNKNOWN'].map(status => { const style = PERSONAL_DAY_STYLES[status]; return <span key={status} className="inline-flex items-center gap-1.5 text-[10px]" style={mutedStyle}><span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full text-[9px] font-bold" style={{ color: style.color, backgroundColor: style.background }}>{style.short || '—'}</span>{style.label}</span>; })}</div>
          </>}
        </section>

        {/* User specific Daily history section */}
        <section className="min-w-0 rounded-2xl border p-4 shadow-sm sm:p-5" style={cardStyle} aria-label="Daily history">
          <h3 className="mb-3 text-sm font-semibold">
            Daily history · {attendanceDateLabel(`${month}-01`, { month: 'long', year: 'numeric' })}
          </h3>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--color-border-default)' }}>
            <table className="w-full text-left text-xs">
              <thead style={controlStyle}>
                <tr>
                  {['Date', 'Status', 'Check-in', 'Check-out', 'Attendance'].map(label => (
                    <th key={label} className="whitespace-nowrap px-3 py-3 font-medium">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historyDays.map(day => {
                  const status = day.displayStatus || personalDayStatus(day);
                  const isSelected = selectedDate === day.workDateKey;
                  return (
                    <tr
                      key={day.workDateKey}
                      className="border-t transition-colors"
                      style={{
                        borderColor: 'var(--color-border-subtle)',
                        backgroundColor: isSelected ? 'var(--color-primary-subtle)' : undefined
                      }}
                    >
                      <td className="whitespace-nowrap px-3 py-3">
                        <button
                          type="button"
                          className="whitespace-nowrap font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-300"
                          onClick={() => setSelectedDate(day.workDateKey)}
                        >
                          {attendanceDateLabel(day.workDateKey)}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <TeamStatus day={{ ...day, displayStatus: status }} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">{formatTime(day.activeSession?.checkInAt || day.firstCheckInAt)}</td>
                      <td className="whitespace-nowrap px-3 py-3">{formatTime(day.lastCheckOutAt)}</td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums">
                        {day.workedMinutes != null && day.workedMinutes > 0
                          ? formatHours(day.workedMinutes)
                          : (day.hasAttendance ? '0h 0m' : 'N/A')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && !historyDays.length && (
              <p className="p-5 text-center text-sm" style={mutedStyle}>
                No recorded attendance or approved leave this month.
              </p>
            )}
          </div>
        </section>
      </div>

      <aside className="min-w-0 space-y-4"><DayDetails day={dates.get(selectedDate)} selectedDate={selectedDate} timezone={timezone} pending={loading && !dates.has(selectedDate)} error={error && !dates.has(selectedDate)} />{children}</aside>
    </div>
  </div>;
}
