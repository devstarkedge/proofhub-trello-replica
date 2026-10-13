import React, { memo } from 'react';

const DATE_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'today', label: 'Today' },
  { value: 'thisWeek', label: 'This Week' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'before', label: 'Before...' },
  { value: 'after', label: 'After...' },
  { value: 'between', label: 'Between...' },
];

const DateFilter = memo(({ label, filter, onChange }) => {
  const handleTypeChange = (type) => {
    if (type === 'any') {
      onChange({ type: 'any', value: null });
    } else if (type === 'between') {
      onChange({ type, value: filter.value?.start ? filter.value : { start: '', end: '' } });
    } else if (['before', 'after', 'exact'].includes(type)) {
      onChange({ type, value: filter.value && typeof filter.value === 'string' ? filter.value : '' });
    } else {
      onChange({ type, value: null });
    }
  };

  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {DATE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handleTypeChange(opt.value)}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all ${
              filter.type === opt.value
                ? 'bg-purple-50 border-purple-300 text-purple-700'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Date input(s) for types that need them */}
      {filter.type === 'before' && (
        <input
          type="date"
          value={filter.value || ''}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
          className="w-full px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-300"
        />
      )}
      {filter.type === 'after' && (
        <input
          type="date"
          value={filter.value || ''}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
          className="w-full px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-300"
        />
      )}
      {filter.type === 'between' && (
        <div className="flex gap-2">
          <input
            type="date"
            value={filter.value?.start || ''}
            onChange={(e) => onChange({ ...filter, value: { ...(filter.value || {}), start: e.target.value } })}
            className="flex-1 px-2 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-300"
          />
          <span className="text-xs text-gray-400 self-center">to</span>
          <input
            type="date"
            value={filter.value?.end || ''}
            onChange={(e) => onChange({ ...filter, value: { ...(filter.value || {}), end: e.target.value } })}
            className="flex-1 px-2 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-300"
          />
        </div>
      )}
    </div>
  );
});

DateFilter.displayName = 'DateFilter';
export default DateFilter;
