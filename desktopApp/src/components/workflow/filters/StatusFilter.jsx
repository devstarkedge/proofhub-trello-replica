import React, { memo, useState, useMemo } from 'react';
import { Search } from 'lucide-react';

const StatusFilter = memo(({ statuses, selected, onChange, counts = {} }) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return statuses;
    const q = search.toLowerCase();
    return statuses.filter(s => s.toLowerCase().includes(q));
  }, [statuses, search]);

  const toggleStatus = (status) => {
    if (selected.includes(status)) {
      onChange(selected.filter(s => s !== status));
    } else {
      onChange([...selected, status]);
    }
  };

  const allSelected = filtered.length > 0 && filtered.every(s => selected.includes(s));
  const toggleAll = () => {
    if (allSelected) {
      onChange(selected.filter(s => !filtered.includes(s)));
    } else {
      const merged = new Set([...selected, ...filtered]);
      onChange([...merged]);
    }
  };

  return (
    <div className="space-y-2">
      {statuses.length > 4 && (
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search statuses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-300 focus:border-purple-300 transition-colors"
          />
        </div>
      )}

      {filtered.length > 1 && (
        <button onClick={toggleAll} className="text-[11px] font-medium text-purple-600 hover:text-purple-700 px-2">
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      )}

      <div className="space-y-1 max-h-52 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {filtered.map((status) => (
          <label
            key={status}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={selected.includes(status)}
              onChange={() => toggleStatus(status)}
              className="sr-only peer"
            />
            <div className="w-[18px] h-[18px] rounded border-2 border-gray-200 peer-checked:border-purple-500 peer-checked:bg-purple-500 transition-all flex items-center justify-center flex-shrink-0">
              {selected.includes(status) && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <span className="text-sm text-gray-700 flex-1">{status}</span>
            {counts[status] != null && (
              <span className="text-[10px] text-gray-400 font-medium tabular-nums">{counts[status]}</span>
            )}
          </label>
        ))}
      </div>

      {filtered.length === 0 && statuses.length > 0 && (
        <p className="text-xs text-gray-400 px-2 py-1 text-center">No matching statuses</p>
      )}
      {statuses.length === 0 && (
        <p className="text-xs text-gray-400 px-2 py-1">No statuses available</p>
      )}
    </div>
  );
});

StatusFilter.displayName = 'StatusFilter';
export default StatusFilter;
