import React, { memo } from 'react';

const PRIORITIES = [
  { value: 'critical', label: 'Critical', color: 'bg-red-600' },
  { value: 'high', label: 'High', color: 'bg-red-400' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-400' },
  { value: 'low', label: 'Low', color: 'bg-gray-400' },
  { value: '', label: 'No Priority', color: 'bg-gray-200' },
];

const PriorityFilter = memo(({ selected, onChange, counts = {} }) => {
  const togglePriority = (value) => {
    if (selected.includes(value)) {
      onChange(selected.filter(p => p !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div className="space-y-1">
      {PRIORITIES.map((p) => (
        <label
          key={p.value}
          className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
        >
          <input
            type="checkbox"
            checked={selected.includes(p.value)}
            onChange={() => togglePriority(p.value)}
            className="sr-only peer"
          />
          <div className="w-[18px] h-[18px] rounded border-2 border-gray-200 peer-checked:border-purple-500 peer-checked:bg-purple-500 transition-all flex items-center justify-center flex-shrink-0">
            {selected.includes(p.value) && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <div className={`w-2.5 h-2.5 rounded-full ${p.color} flex-shrink-0`} />
          <span className="text-sm text-gray-700 flex-1">{p.label}</span>
          {counts[p.value] != null && (
            <span className="text-[10px] text-gray-400 font-medium tabular-nums">{counts[p.value]}</span>
          )}
        </label>
      ))}
    </div>
  );
});

PriorityFilter.displayName = 'PriorityFilter';
export default PriorityFilter;
