import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toDateKey } from '../../../utils/leaveDateKey';
import * as leaveApi from '../../../services/leaveApi';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DAY_TYPE_STYLES = {
  WORKING_DAY: { label: 'Working Day', color: 'var(--color-success-text)', backgroundColor: 'var(--color-success-subtle)' },
  WEEKLY_OFF: { label: 'Weekly Off', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-bg-muted)' },
  RECURRING_WORKING: { label: 'Alternate Working Day', color: 'var(--color-info-text)', backgroundColor: 'var(--color-info-subtle)' },
  RECURRING_OFF: { label: 'Alternate Off', color: 'var(--color-warning-text)', backgroundColor: 'var(--color-warning-subtle)' },
  SPECIAL_WORKING_DAY: { label: 'Special Working Day', color: 'var(--color-success-text)', backgroundColor: 'var(--color-success-subtle)' },
  SPECIAL_OFF_DAY: { label: 'Special Off Day', color: 'var(--color-error-text)', backgroundColor: 'var(--color-error-subtle)' },
  HOLIDAY: { label: 'Holiday', color: 'var(--color-error-text)', backgroundColor: 'var(--color-error-subtle)' }
};
const LEGEND_ORDER = ['WORKING_DAY', 'WEEKLY_OFF', 'RECURRING_WORKING', 'RECURRING_OFF', 'SPECIAL_WORKING_DAY', 'SPECIAL_OFF_DAY', 'HOLIDAY'];

function buildMonthCells(year, month) {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  return cells;
}

/**
 * Runs the DRAFT (unsaved) configuration through the real backend resolver
 * for one month, debounced — never a client-side reimplementation of the
 * precedence/nth-weekday algorithm, so this can never drift from what
 * clicking Save actually produces.
 */
const WorkCalendarPreviewCalendar = ({ draft }) => {
  const [cursor, setCursor] = useState(() => new Date());
  const [daysByDate, setDaysByDate] = useState({});
  const [loading, setLoading] = useState(false);

  const cells = useMemo(() => buildMonthCells(cursor.getFullYear(), cursor.getMonth()), [cursor]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      leaveApi.previewWorkCalendarConfig({
        year: cursor.getFullYear(), month: cursor.getMonth() + 1,
        weeklyPattern: draft.weeklyPattern, standardWorkMinutesPerDay: draft.standardWorkMinutesPerDay,
        recurringRules: draft.recurringRules, dateOverrides: draft.dateOverrides
      })
        .then(({ data }) => setDaysByDate(Object.fromEntries((data.days || []).map((d) => [d.date, d]))))
        .catch(() => setDaysByDate({}))
        .finally(() => setLoading(false));
    }, 350); // debounced — avoid a request per keystroke while editing rules
    return () => clearTimeout(timer);
  }, [cursor, draft]);

  const changeMonth = (offset) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + offset, 1));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => changeMonth(-1)} className="rounded-lg p-1.5 hover:bg-[var(--color-bg-muted)]" aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" style={{ color: 'var(--color-text-secondary)' }} />
        </button>
        <h4 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}{loading && ' · updating…'}
        </h4>
        <button type="button" onClick={() => changeMonth(1)} className="rounded-lg p-1.5 hover:bg-[var(--color-bg-muted)]" aria-label="Next month">
          <ChevronRight className="h-4 w-4" style={{ color: 'var(--color-text-secondary)' }} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {DAY_LABELS.map((label) => (
          <div key={label} className="py-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
        ))}
        {cells.map((date, index) => {
          if (!date) return <div key={`empty-${index}`} />;
          const key = toDateKey(date);
          const day = daysByDate[key];
          const style = day ? DAY_TYPE_STYLES[day.dayType] : null;
          return (
            <div
              key={key}
              className="flex min-h-[2.75rem] flex-col items-center justify-center rounded-lg text-xs"
              style={{ backgroundColor: style?.backgroundColor || 'transparent', color: style?.color || 'var(--color-text-primary)' }}
              title={style?.label || ''}
            >
              {date.getDate()}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {LEGEND_ORDER.map((type) => (
          <span key={type} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DAY_TYPE_STYLES[type].backgroundColor, border: `1px solid ${DAY_TYPE_STYLES[type].color}` }} />
            {DAY_TYPE_STYLES[type].label}
          </span>
        ))}
      </div>
    </div>
  );
};

export default WorkCalendarPreviewCalendar;
