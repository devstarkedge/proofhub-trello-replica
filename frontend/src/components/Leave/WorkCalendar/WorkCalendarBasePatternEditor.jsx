import React from 'react';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATES = [
  { key: 'WORKING', label: 'Working' },
  { key: 'HALF', label: 'Half day' },
  { key: 'OFF', label: 'Off' }
];

const inputClass = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]';
const inputStyle = { backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' };

function stateOf(day) {
  if (!day.isWorkingDay) return 'OFF';
  return day.isHalfWorkingDay ? 'HALF' : 'WORKING';
}

const STATE_STYLE = {
  WORKING: { backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success-text)' },
  HALF: { backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning-text)' },
  OFF: { backgroundColor: 'var(--color-bg-muted)', color: 'var(--color-text-muted)' }
};

/**
 * The base weekly pattern — every weekday is independently Working / Half
 * day / Off, with no assumption anywhere about which specific days those
 * are (Configuration A/B/C in the spec are all just different button
 * presses here, not different code paths).
 */
const WorkCalendarBasePatternEditor = ({ weeklyPattern, standardWorkMinutesPerDay, onChange }) => {
  const setDayState = (dayOfWeek, state) => {
    onChange({
      weeklyPattern: weeklyPattern.map((day) => day.dayOfWeek === dayOfWeek
        ? { ...day, isWorkingDay: state !== 'OFF', isHalfWorkingDay: state === 'HALF' }
        : day),
      standardWorkMinutesPerDay
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {weeklyPattern.map((day) => {
          const current = stateOf(day);
          return (
            <div key={day.dayOfWeek} className="flex flex-col items-center gap-1.5">
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>{DAY_NAMES[day.dayOfWeek]}</span>
              <div className="flex w-full flex-col gap-1">
                {STATES.map((state) => (
                  <button
                    key={state.key}
                    type="button"
                    onClick={() => setDayState(day.dayOfWeek, state.key)}
                    className="rounded-md px-1 py-1.5 text-[10px] font-medium transition-opacity sm:text-[11px]"
                    style={current === state.key ? STATE_STYLE[state.key] : { backgroundColor: 'transparent', color: 'var(--color-text-muted)', opacity: 0.6 }}
                    aria-pressed={current === state.key}
                  >
                    {state.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <label className="block max-w-xs text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        Standard work minutes per day
        <input
          type="number" min="1" max="1440" className={`${inputClass} mt-1.5`} style={inputStyle}
          value={standardWorkMinutesPerDay}
          onChange={(e) => onChange({ weeklyPattern, standardWorkMinutesPerDay: Number(e.target.value) || 480 })}
        />
        <span className="mt-1 block text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          Used for expected-hours math in Reports and Teams — a half day counts half this value.
        </span>
      </label>
    </div>
  );
};

export default WorkCalendarBasePatternEditor;
