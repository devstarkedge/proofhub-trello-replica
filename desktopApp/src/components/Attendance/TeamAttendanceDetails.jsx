import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-react';
import Avatar from '../Avatar';
import * as attendanceApi from '../../services/attendanceApi';
import { formatHours } from '../../utils/duration';
import { workspaceDateKey } from '../../utils/workspaceDateRange';
import { TeamStatus, Rate, ReadState } from './TeamAttendanceShared';
import { controlClass, inputStyle, panelStyle, mutedStyle, labels, useTeamRead, shiftMonth, statusTone, dateLabel } from '../../hooks/useTeamAttendanceReport';

export default function TeamAttendanceDetails({ userId, query, revision, timezone, onClose, onForbidden }) {
  const today = workspaceDateKey(new Date(), timezone);
  const initialMonth = today >= query.startDate && today <= query.endDate ? today.slice(0, 7) : query.startDate.slice(0, 7);
  const [month, setMonth] = useState(initialMonth), [selectedDate, setSelectedDate] = useState(today.slice(0, 7) === initialMonth ? today : `${initialMonth}-01`);
  const [retry, setRetry] = useState(0), root = useRef(null), grid = useRef(null);
  const loadMonth = useCallback(signal => attendanceApi.getTeamAttendanceMonth(userId, month, { departmentId: query.departmentId }, signal), [userId, month, query.departmentId]);
  const monthRead = useTeamRead(JSON.stringify([userId, month, query.departmentId, revision, retry]), loadMonth);
  const loadDay = useCallback(signal => attendanceApi.getTeamAttendanceDay(userId, selectedDate, { departmentId: query.departmentId }, signal), [userId, selectedDate, query.departmentId]);
  const dayRead = useTeamRead(JSON.stringify([userId, selectedDate, query.departmentId, revision, retry]), loadDay);
  const loadSummary = useCallback(signal => attendanceApi.getTeamAttendance({ ...query, userId, search: '', page: 1 }, signal), [query, userId]);
  const summaryRead = useTeamRead(JSON.stringify([query, userId, revision, retry]), loadSummary), summary = summaryRead.data?.rows?.[0];
  useEffect(() => {
    const previous = document.activeElement, priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; root.current?.querySelector('button')?.focus();
    const keydown = event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const items = [...(root.current?.querySelectorAll('button:not(:disabled),a[href],input,select,[tabindex="0"]') || [])], first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown, true);
    return () => { document.body.style.overflow = priorOverflow; document.removeEventListener('keydown', keydown, true); previous?.focus?.(); };
  }, [onClose]);
  useEffect(() => { if (monthRead.forbidden || dayRead.forbidden || summaryRead.forbidden) onForbidden(); }, [monthRead.forbidden, dayRead.forbidden, summaryRead.forbidden, onForbidden]);
  const navigate = delta => { const next = shiftMonth(month, delta); setMonth(next); setSelectedDate(`${next}-01`); };
  const days = monthRead.data?.days || [], chosen = dayRead.data, calendarDay = days.find(day => day.workDateKey === selectedDate);
  const firstDay = new Date(`${month}-01T12:00:00Z`).getUTCDay();
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`));
  const time = value => value ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(value)) : 'N/A';
  const moveDay = event => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key]; if (!delta) return;
    event.preventDefault(); const date = new Date(`${selectedDate}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + delta);
    const next = date.toISOString().slice(0, 10); setSelectedDate(next); if (next.slice(0, 7) !== month) setMonth(next.slice(0, 7));
    requestAnimationFrame(() => grid.current?.querySelector(`[data-date="${next}"]`)?.focus());
  };
  return createPortal(<div className="fixed inset-0 z-[110] flex justify-end bg-black/25 backdrop-blur-[2px]" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={root} role="dialog" aria-modal="true" aria-labelledby="attendance-detail-title" className="h-full w-full max-w-[650px] overflow-y-auto border-l shadow-2xl" style={panelStyle}>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b px-5 py-4" style={panelStyle}><h2 id="attendance-detail-title" className="font-semibold">Attendance details</h2><button aria-label="Close attendance details" onClick={onClose} className="rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/10"><X size={20} /></button></header>
      <div className="space-y-5 p-4 sm:p-5">
        {monthRead.data && <div className="flex items-center gap-3"><Avatar src={monthRead.data.user.avatar} name={monthRead.data.user.name || ''} size="lg" showBadge={false} /><div className="min-w-0"><h3 className="truncate text-lg font-semibold">{monthRead.data.user.name || 'Member details unavailable'}</h3><p className="truncate text-sm" style={mutedStyle}>{monthRead.data.user.email || 'Email unavailable'}</p><p className="text-xs" style={mutedStyle}>{monthRead.data.departments.map(d => d.name).join(' · ') || 'Department unavailable'}</p></div></div>}
        <section aria-label="Selected range summary"><p className="mb-2 text-xs font-medium" style={mutedStyle}>Selected range · {dateLabel(query.startDate)} – {dateLabel(query.endDate)}</p><ReadState read={summaryRead} retry={() => setRetry(v => v + 1)}>
          {summary ? <><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[['Present', 'present'], ['Half days', 'halfDays'], ['Absent', 'absent'], ['Missing checkout', 'missingCheckout']].map(([label, key]) => <div key={key} className="rounded-xl border p-3" style={inputStyle}><p className="text-xs" style={mutedStyle}>{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{summary[key]}</p></div>)}</div><div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"><span>Attendance time: <strong>{formatHours(summary.attendanceMinutes)}</strong></span><span>Full-period rate <Rate rate={summary.attendanceRate} /></span></div>{summary.attendanceRate.reason && <p className="mt-2 text-xs" style={mutedStyle}>{summary.attendanceRate.reason}</p>}</> : <p className="text-sm" style={mutedStyle}>No days match the selected dashboard filters.</p>}
        </ReadState></section>
        <section className="rounded-xl border p-3" style={{ borderColor: 'var(--color-border-default)' }}>
          <div className="mb-4 flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays size={16} />{monthLabel}</h3><div className="flex gap-1"><button aria-label="Previous month" className={controlClass} style={inputStyle} onClick={() => navigate(-1)}><ChevronLeft size={16} /></button><button aria-label="Next month" className={controlClass} style={inputStyle} onClick={() => navigate(1)}><ChevronRight size={16} /></button></div></div>
          <ReadState read={monthRead} retry={() => setRetry(v => v + 1)}><div ref={grid} aria-label={`${monthLabel} attendance calendar`} onKeyDown={moveDay}><div className="mb-2 grid grid-cols-7 text-center text-xs" style={mutedStyle}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span key={day}>{day}</span>)}</div><div className="grid grid-cols-7 gap-1.5">{Array.from({ length: firstDay }, (_, index) => <span key={`blank-${index}`} />)}
            {days.map(day => { const matches = day.workDateKey >= query.startDate && day.workDateKey <= query.endDate && (!query.status || day.displayStatus === query.status) && (!query.workMode || day.workMode === query.workMode);
              return <button key={day.workDateKey} data-date={day.workDateKey} tabIndex={selectedDate === day.workDateKey ? 0 : -1} aria-pressed={selectedDate === day.workDateKey} aria-label={`${dateLabel(day.workDateKey)}: ${labels[day.displayStatus] || day.displayStatus}${day.activeSession ? ', in progress' : ''}${matches ? ', matches dashboard filters' : ''}`} title={`${labels[day.displayStatus] || day.displayStatus}${day.leaveState && day.leaveState !== 'NONE' ? ` · ${labels[day.leaveState]}` : ''}`} onClick={() => setSelectedDate(day.workDateKey)} className={`relative min-h-10 rounded-lg text-sm font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${statusTone(day.displayStatus)} ${selectedDate === day.workDateKey ? 'ring-2 ring-blue-600 ring-offset-2 dark:ring-offset-gray-900' : ''}`}>{Number(day.workDateKey.slice(-2))}{matches && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-current" />}{day.activeSession && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-blue-500" />}</button>; })}
          </div></div></ReadState>
          <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2">{['PRESENT', 'HALF_PRESENT', 'ABSENT', 'MISSING_CHECKOUT', 'ON_LEAVE', 'HOLIDAY', 'WEEKLY_OFF', 'UNKNOWN'].map(status => <span key={status} className="inline-flex items-center gap-1.5 text-[11px]" style={mutedStyle}><span className={`h-2.5 w-2.5 rounded-sm ${statusTone(status)}`} />{labels[status]}</span>)}</div><p className="mt-3 text-[11px]" style={mutedStyle}>Dots mark dates matching dashboard filters. Historical dates without a snapshot remain unknown.</p>
        </section>
        <section className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border-default)' }}><h3 className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold"><span>{dateLabel(selectedDate)} · Daily log</span><TeamStatus day={calendarDay || chosen?.day} /></h3><ReadState read={dayRead} retry={() => setRetry(v => v + 1)}>
          {chosen && <><div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">{[['Check-in', time(chosen.day.firstCheckInAt)], ['Check-out', time(chosen.day.lastCheckOutAt)], ['Attendance time', formatHours(chosen.day.workedMinutes)], ['Work mode', labels[chosen.day.workMode] || 'N/A']].map(([label, value]) => <div key={label}><p style={mutedStyle}>{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p></div>)}</div>
            <div className="mt-4 border-t pt-3 text-xs" style={{ borderColor: 'var(--color-border-subtle)' }}><p className="flex items-center gap-2"><Clock3 size={14} />Tracked work time: <strong>{chosen.trackedWork.seconds == null ? 'N/A' : formatHours(chosen.trackedWork.seconds / 60)}</strong></p>{chosen.trackedWork.reason && <p className="mt-1" style={mutedStyle}>{chosen.trackedWork.reason}</p>}</div>
            {chosen.schedule.startLocalTime && <p className="mt-3 text-xs">Schedule: {chosen.schedule.startLocalTime} – {chosen.schedule.endLocalTime} · {timezone}</p>}{chosen.schedule.expectedMinutes != null && <p className="mt-2 text-xs" style={mutedStyle}>Policy attendance threshold: {formatHours(chosen.schedule.expectedMinutes)}</p>}
            {chosen.sessions.length > 1 && <div className="mt-3 space-y-1 text-xs">{chosen.sessions.map((session, index) => <p key={index}>{time(session.checkInAt)} – {time(session.checkOutAt)} · {session.regularized ? 'Approved correction' : session.status}</p>)}</div>}
            {chosen.approvedLeaves.map((leave, index) => <p key={index} className="mt-3 text-xs text-sky-700 dark:text-sky-300">Approved leave · {leave.type || 'Type unavailable'} · {leave.dayType.replaceAll('_', ' ').toLowerCase()}{leave.startLocalTime ? ` · ${leave.startLocalTime}–${leave.endLocalTime}` : ''}</p>)}
            {chosen.regularizations.map((item, index) => <p key={index} className="mt-2 text-xs" style={mutedStyle}>Correction: {item.type.replaceAll('_', ' ').toLowerCase()} · {item.status.replaceAll('_', ' ').toLowerCase()}</p>)}
            {chosen.day.exceptionFlags?.length > 0 && <p className="mt-3 text-xs" style={mutedStyle}>{chosen.day.exceptionFlags.map(flag => flag.replaceAll('_', ' ').toLowerCase()).join(' · ')}</p>}{!chosen.day.hasAttendance && <p className="mt-3 text-xs" style={mutedStyle}>No attendance record exists for this date. This does not establish absence.</p>}</>}
        </ReadState></section>
        <section><h3 className="mb-3 text-sm font-semibold">Daily history · {monthLabel}</h3><div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--color-border-default)' }}><table className="w-full text-left text-xs"><thead style={inputStyle}><tr>{['Date', 'Status', 'Check-in', 'Check-out', 'Attendance'].map(label => <th key={label} className="whitespace-nowrap px-3 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{days.filter(day => day.hasAttendance || day.leaveState && day.leaveState !== 'NONE').slice().reverse().map(day => <tr key={day.workDateKey} className="border-t" style={{ borderColor: 'var(--color-border-subtle)' }}><td className="px-3 py-3"><button className="whitespace-nowrap text-blue-600 underline-offset-2 hover:underline dark:text-blue-300" onClick={() => setSelectedDate(day.workDateKey)}>{dateLabel(day.workDateKey)}</button></td><td className="px-3 py-3"><TeamStatus day={day} /></td><td className="whitespace-nowrap px-3 py-3">{time(day.firstCheckInAt)}</td><td className="whitespace-nowrap px-3 py-3">{time(day.lastCheckOutAt)}</td><td className="whitespace-nowrap px-3 py-3">{day.hasAttendance ? formatHours(day.workedMinutes) : 'N/A'}</td></tr>)}</tbody></table>{!monthRead.loading && !days.some(day => day.hasAttendance || day.leaveState && day.leaveState !== 'NONE') && <p className="p-5 text-center text-sm" style={mutedStyle}>No recorded attendance or approved leave this month.</p>}</div></section>
        <p className="text-xs" style={mutedStyle}>Times shown in {timezone}. Attendance and tracked work time are separate measurements.</p>
      </div>
    </section>
  </div>, document.body);
}
