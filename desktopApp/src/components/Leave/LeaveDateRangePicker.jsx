import React from 'react';

/**
 * No date-RANGE picker exists anywhere in FlowTask today (DatePickerModal.jsx
 * is single-date only) — this is genuinely new. Deliberately built on plain
 * native <input type="date"> rather than a custom calendar-grid widget: it's
 * fully accessible and keyboard-operable for free, and the leave request
 * form's real complexity is the validation/classification behind it, not
 * the date-picking UI itself.
 */
const inputClass =
  'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]';
const inputStyle = {
  backgroundColor: 'var(--color-bg-base)',
  borderColor: 'var(--color-border-default)',
  color: 'var(--color-text-primary)'
};

const LeaveDateRangePicker = ({ startDate, endDate, onChange, singleDay = false, minDate }) => {
  const handleStartChange = (value) => {
    onChange({ startDate: value, endDate: singleDay ? value : (endDate && endDate >= value ? endDate : value) });
  };
  const handleEndChange = (value) => {
    onChange({ startDate, endDate: value });
  };

  if (singleDay) {
    return (
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Date</label>
        <input
          type="date"
          className={inputClass}
          style={inputStyle}
          value={startDate || ''}
          min={minDate}
          onChange={(e) => handleStartChange(e.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Start Date</label>
        <input
          type="date"
          className={inputClass}
          style={inputStyle}
          value={startDate || ''}
          min={minDate}
          onChange={(e) => handleStartChange(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>End Date</label>
        <input
          type="date"
          className={inputClass}
          style={inputStyle}
          value={endDate || ''}
          min={startDate || minDate}
          onChange={(e) => handleEndChange(e.target.value)}
        />
      </div>
    </div>
  );
};

export default LeaveDateRangePicker;
