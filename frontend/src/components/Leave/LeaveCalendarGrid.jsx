import { useContext } from 'react';
import WorkspaceContext from '../../context/WorkspaceContext';
import { workspaceDateKey } from '../../utils/workspaceDateRange';
import { formatHours } from '../../utils/duration';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import DayStatusIndicator from './DayStatusIndicator';
import LeaveCalendarEventPopover from './LeaveCalendarEventPopover';
import * as leaveApi from '../../services/leaveApi';
import { toDateKey } from '../../utils/leaveDateKey';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_TYPE_LABELS = {
  FULL_DAY: 'Full Day Leave',
  HALF_DAY_FIRST_HALF: 'Half Day (AM)',
  HALF_DAY_SECOND_HALF: 'Half Day (PM)',
  SHORT_LEAVE: 'Short Leave'
};
const EVENT_STYLES = {
  leave: { color: 'var(--color-success-text)', backgroundColor: 'var(--color-success-subtle)' },
  pending: { color: 'var(--color-warning-text)', backgroundColor: 'var(--color-warning-subtle)' },
  holiday: { color: 'var(--color-info-text)', backgroundColor: 'var(--color-info-subtle)' },
  weeklyOff: { color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-bg-muted)' },
  specialWorkday: { color: 'var(--color-success-text)', backgroundColor: 'var(--color-success-subtle)' }
};

function buildMonthCells(year, month) {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  return cells;
}

const toKey = toDateKey;
const formatDate = (date) => date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function indexHolidaysByDate(holidays) {
  const byDate = new Map();
  for (const holiday of holidays) {
    const storedDate = holiday.dateKey || String(holiday.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(storedDate)) continue;
    const dateKey = storedDate;
    const bucket = byDate.get(dateKey) || [];
    bucket.push(holiday);
    byDate.set(dateKey, bucket);
    if (holiday.recurrenceRule === 'ANNUAL_SAME_DATE') byDate.set(`*-${dateKey.slice(5)}`, [...(byDate.get(`*-${dateKey.slice(5)}`) || []), holiday]);
  }
  return byDate;
}

function holidayScopeLabel(holiday) {
  if (holiday.scope === 'department') return 'Department Holiday';
  if (holiday.scope === 'location') return holiday.locationTag ? `Location Holiday · ${holiday.locationTag}` : 'Location Holiday';
  return 'Workspace Holiday';
}

function buildHolidayEvent(holiday, date, index) {
  const specialWorkingDay = holiday.type === 'SPECIAL_WORKING_DAY';
  const style = specialWorkingDay ? EVENT_STYLES.specialWorkday : EVENT_STYLES.holiday;
  return {
    id: `holiday-${holiday._id || index}`,
    kind: specialWorkingDay ? 'specialWorkday' : 'holiday',
    kindLabel: specialWorkingDay ? 'Special Working Day' : 'Holiday',
    title: holiday.name || (specialWorkingDay ? 'Special Working Day' : 'Holiday'),
    cellLabel: holiday.name || (specialWorkingDay ? 'Special Workday' : 'Holiday'),
    ...style,
    details: [
      { label: 'Name', value: holiday.name || 'Holiday' },
      { label: 'Date', value: formatDate(date) },
      { label: 'Type', value: holidayScopeLabel(holiday) },
      ...(holiday.isHalfDay ? [{ label: 'Duration', value: 'Half day' }] : []),
      ...(holiday.recurrenceRule === 'ANNUAL_SAME_DATE' ? [{ label: 'Repeats', value: 'Annually' }] : [])
    ]
  };
}

function buildEventsForDate({ status, holidays, date, leaveEvents = [] }) {
  const events = leaveEvents.map((day) => ({
    id: String(day._id), kind: day.pending ? 'pending' : 'leave',
    kindLabel: day.pending ? 'Pending Leave' : 'Approved Leave',
    title: day.request.requester?.name || day.request.leaveType?.name || 'Leave',
    cellLabel: (day.pending ? 'Pending · ' : '') + (day.request.requester?.name || day.request.leaveType?.name || 'Leave'),
    ...(day.pending ? EVENT_STYLES.pending : EVENT_STYLES.leave),
    details: [
      { label: 'Employee', value: day.request.requester?.name || 'Employee' },
      { label: 'Leave Type', value: day.request.leaveType?.name || 'Leave' },
      { label: 'Day', value: DAY_TYPE_LABELS[day.dayType] || day.dayType },
      { label: 'Status', value: day.pending ? 'Pending' : day.request.status === 'CANCELLATION_REQUESTED' ? 'Approved — cancellation requested' : 'Approved' },
      ...(day.dayType === 'SHORT_LEAVE' ? [{ label: 'Time', value: day.shortLeaveStartTime + '–' + day.shortLeaveEndTime }, { label: 'Duration', value: formatHours(day.shortLeaveDurationMinutes) }] : [])
    ]
  }));
  const holidayEvents = holidays.map((holiday, index) => buildHolidayEvent(holiday, date, index));

  events.push(...holidayEvents);
  if (status?.status === 'HOLIDAY') {
    const standardHolidays = holidayEvents.filter((event) => event.kind === 'holiday');
    events.push(...(standardHolidays.length ? [] : [{
      id: 'holiday',
      kind: 'holiday',
      kindLabel: 'Holiday',
      title: status.holidayName || 'Holiday',
      cellLabel: status.holidayName || 'Holiday',
      ...EVENT_STYLES.holiday,
      details: [
        ...(status.holidayName ? [{ label: 'Name', value: status.holidayName }] : []),
        { label: 'Date', value: formatDate(date) }
      ]
    }]));
  } else if (status?.status === 'WEEKLY_OFF') {
    events.push({
      id: 'weekly-off',
      kind: 'weeklyOff',
      kindLabel: 'Weekly Off',
      title: 'Non-working day',
      cellLabel: 'Weekly Off',
      ...EVENT_STYLES.weeklyOff,
      details: [
        { label: 'Date', value: formatDate(date) },
        { label: 'Type', value: 'Recurring weekly off' }
      ]
    });
  }

  return events;
}

/** Month-view calendar for one user's own day-status. Reusable for a future team roster view. */
const LeaveCalendarGrid = ({ userId }) => {
  const { currentWorkspace } = useContext(WorkspaceContext);
  const [cursor, setCursor] = useState(() => new Date(workspaceDateKey(new Date(), currentWorkspace?.timezone) + 'T12:00:00'));
  const [leaveEvents, setLeaveEvents] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const [dayStatus, setDayStatus] = useState({});
  const [holidays, setHolidays] = useState([]);
  const [activeDetails, setActiveDetails] = useState(null);
  const closeTimerRef = useRef(null);

  const cells = useMemo(() => buildMonthCells(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const holidaysByDate = useMemo(
    () => indexHolidaysByDate(holidays),
    [holidays]
  );

  const loadHolidays = useCallback(() => {
    leaveApi.getHolidays()
      .then(({ data }) => setHolidays(data || []))
      .catch(() => { setHolidays([]); setError('Unable to load workspace holidays'); });
  }, []);

  const loadDayStatus = useCallback(() => {
    if (!userId) return;
    const validDates = cells.filter(Boolean);
    if (!validDates.length) return;
    const startDate = toKey(validDates[0]);
    const endDate = toKey(validDates[validDates.length - 1]);
    const id = ++generation.current;
    setLoading(true); setError('');
    Promise.all([
      leaveApi.getDayStatus({ userIds: [userId], startDate, endDate, visibility: 'approved_only', calendarOnly: true }),
      leaveApi.getCalendarEvents({ startDate, endDate })
    ]).then(([days, leaves]) => { if (id === generation.current) { setDayStatus(days.data[userId] || {}); setLeaveEvents(leaves.data.events || []); } })
      .catch(() => { if (id === generation.current) { setDayStatus({}); setLeaveEvents([]); setError('Unable to load calendar events. Try refreshing.'); } })
      .finally(() => { if (id === generation.current) setLoading(false); });
  }, [cells, userId]);

  useEffect(() => { loadHolidays(); }, [loadHolidays]);
  useEffect(() => { const requestGeneration = generation; loadDayStatus(); return () => { requestGeneration.current++; }; }, [loadDayStatus]);

  // The Work Calendar / Holiday list can change from the Settings page (or
  // another admin) at any time — refetch rather than let this grid drift
  // out of sync with what actually governs classification server-side.
  useEffect(() => {
    const onCalendarUpdated = () => { loadHolidays(); loadDayStatus(); };
    const names = ['socket-leave-calendar-updated', 'socket-leave-request-created', 'socket-leave-request-updated', 'socket-leave-approval-updated'];
    names.forEach((name) => window.addEventListener(name, onCalendarUpdated));
    return () => names.forEach((name) => window.removeEventListener(name, onCalendarUpdated));
  }, [loadHolidays, loadDayStatus]);

  useEffect(() => () => clearTimeout(closeTimerRef.current), []);

  const cancelScheduledClose = useCallback(() => {
    clearTimeout(closeTimerRef.current);
  }, []);

  const scheduleClose = useCallback(() => {
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => setActiveDetails(null), 140);
  }, []);

  const showDetails = useCallback((date, dateKey, events, anchor) => {
    if (!events.length) return;
    cancelScheduledClose();
    setActiveDetails({ dateKey, date: formatDate(date), dateValue: date, anchor });
  }, [cancelScheduledClose]);

  const changeMonth = (offset) => {
    setActiveDetails(null);
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + offset, 1));
  };

  const activeEvents = activeDetails ? buildEventsForDate({
    status: dayStatus[activeDetails.dateKey],
    holidays: [...new Map([...(holidaysByDate.get(activeDetails.dateKey) || []), ...(holidaysByDate.get(`*-${activeDetails.dateKey.slice(5)}`) || [])].map((h) => [h._id, h])).values()],
    date: activeDetails.dateValue,
    leaveEvents: leaveEvents.filter((event) => event.dateKey === activeDetails.dateKey)
  }) : [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between sm:mb-5">
        <button type="button" onClick={() => changeMonth(-1)} className="rounded-lg p-1.5 hover:bg-[var(--color-bg-muted)]" aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" style={{ color: 'var(--color-text-secondary)' }} />
        </button>
        <h3 className="text-sm font-semibold sm:text-base" style={{ color: 'var(--color-text-primary)' }}>
          {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </h3>
        <button type="button" onClick={() => changeMonth(1)} className="rounded-lg p-1.5 hover:bg-[var(--color-bg-muted)]" aria-label="Next month">
          <ChevronRight className="h-4 w-4" style={{ color: 'var(--color-text-secondary)' }} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center sm:gap-2">
        {DAY_LABELS.map((label) => (
          <div key={label} className="py-1 text-[10px] font-semibold uppercase tracking-wide sm:text-xs" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
        ))}
        {cells.map((date, index) => {
          if (!date) return <div key={`empty-${index}`} />;
          const key = toKey(date);
          const status = dayStatus[key];
          const dateEvents = buildEventsForDate({ status, holidays: [...new Map([...(holidaysByDate.get(key) || []), ...(holidaysByDate.get(`*-${key.slice(5)}`) || [])].map((h) => [h._id, h])).values()], date, leaveEvents: leaveEvents.filter((event) => event.dateKey === key) });
          const isToday = key === workspaceDateKey(new Date(), currentWorkspace?.timezone);
          const hasEvents = dateEvents.length > 0;
          const visibleEvents = dateEvents.slice(0, 2);
          const isOpen = activeDetails?.dateKey === key;

          return (
            <div
              key={key}
              className={`relative flex min-h-[3.75rem] min-w-0 flex-col rounded-lg border px-1.5 py-2 text-left transition-colors sm:min-h-20 sm:px-2 sm:py-2.5 lg:min-h-24 xl:min-h-28 ${hasEvents ? 'cursor-pointer hover:bg-[var(--color-bg-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]' : ''}`}
              style={{
                backgroundColor: isToday ? 'var(--color-bg-muted)' : 'transparent',
                borderColor: isToday ? 'var(--color-border-focus)' : (hasEvents ? 'var(--color-border-subtle)' : 'transparent')
              }}
              role={hasEvents ? 'button' : undefined}
              tabIndex={hasEvents ? 0 : undefined}
              aria-haspopup={hasEvents ? 'dialog' : undefined}
              aria-expanded={hasEvents ? isOpen : undefined}
              aria-label={hasEvents ? `${formatDate(date)}. ${dateEvents.map((event) => `${event.kindLabel}: ${event.title}`).join('. ')}` : formatDate(date)}
              onPointerEnter={(event) => {
                if (event.pointerType === 'mouse') showDetails(date, key, dateEvents, event.currentTarget);
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === 'mouse') scheduleClose();
              }}
              onFocus={(event) => showDetails(date, key, dateEvents, event.currentTarget)}
              onBlur={scheduleClose}
              onClick={(event) => {
                if (!hasEvents) return;
                showDetails(date, key, dateEvents, event.currentTarget);
              }}
              onKeyDown={(event) => {
                if (!hasEvents || !['Enter', ' '].includes(event.key)) return;
                event.preventDefault();
                showDetails(date, key, dateEvents, event.currentTarget);
              }}
            >
              <span className="mb-1 text-center text-xs font-semibold sm:text-sm" style={{ color: 'var(--color-text-primary)' }}>{date.getDate()}</span>
              <div className="min-w-0 space-y-1">
                {visibleEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex min-w-0 items-center gap-1 rounded-md px-1 py-1 text-[9px] font-medium sm:px-1.5 sm:text-[11px]"
                    style={{ backgroundColor: event.backgroundColor, color: event.color }}
                  >
                    <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ backgroundColor: event.color }} />
                    {['leave', 'holiday'].includes(event.kind) && (
                      <span className="hidden flex-none font-semibold lg:inline">{event.kind === 'leave' ? 'On Leave' : 'Holiday'} ·</span>
                    )}
                    <span className="truncate">{event.cellLabel}</span>
                  </div>
                ))}
                {dateEvents.length > visibleEvents.length && (
                  <p className="truncate px-1 text-[9px] font-medium sm:text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                    +{dateEvents.length - visibleEvents.length} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {loading && <p role="status">Loading calendar…</p>}
      {error && <p role="alert">{error} <button type="button" onClick={() => { loadHolidays(); loadDayStatus(); }}>Refresh</button></p>}
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <span className="flex items-center gap-1.5"><DayStatusIndicator dayStatus={{ status: 'ON_LEAVE' }} /> Approved Leave</span>
        <span className="flex items-center gap-1.5" style={{ color: EVENT_STYLES.pending.color }}>● Pending Leave</span>
        <span className="flex items-center gap-1.5"><DayStatusIndicator dayStatus={{ status: 'HOLIDAY' }} /> Holiday</span>
        <span className="flex items-center gap-1.5"><DayStatusIndicator dayStatus={{ status: 'WEEKLY_OFF' }} /> Weekly Off</span>
      </div>

      {activeDetails && activeEvents.length > 0 && (
        <LeaveCalendarEventPopover
          anchor={activeDetails.anchor}
          date={activeDetails.date}
          events={activeEvents}
          onClose={() => setActiveDetails(null)}
          onMouseEnter={cancelScheduledClose}
          onMouseLeave={scheduleClose}
        />
      )}
    </div>
  );
};

export default LeaveCalendarGrid;
