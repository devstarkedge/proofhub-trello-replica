import React, { memo, useState, useMemo } from 'react';
import { Search } from 'lucide-react';

const LabelFilter = memo(({ labels, selected, onChange, counts = {} }) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return labels;
    const q = search.toLowerCase();
    return labels.filter(l => (l.name || '').toLowerCase().includes(q));
  }, [labels, search]);

  const toggleLabel = (id) => {
    if (selected.includes(id)) {
      onChange(selected.filter(l => l !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const isUnlabelledSelected = selected.includes('__unlabelled__');

  return (
    <div className="space-y-2">
      {labels.length > 0 && (
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search labels..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-300 focus:border-purple-300 transition-colors"
          />
        </div>
      )}

      <div className="space-y-0.5 max-h-48 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {/* Unlabelled option */}
        <label className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
          <input
            type="checkbox"
            checked={isUnlabelledSelected}
            onChange={() => toggleLabel('__unlabelled__')}
            className="sr-only peer"
          />
          <div className="w-[18px] h-[18px] rounded border-2 border-gray-200 peer-checked:border-purple-500 peer-checked:bg-purple-500 transition-all flex items-center justify-center flex-shrink-0">
            {isUnlabelledSelected && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <div className="w-3 h-3 rounded-full bg-gray-300 border border-gray-400 flex-shrink-0" />
          <span className="text-sm text-gray-500 italic flex-1">Unlabelled tasks</span>
          {counts.__unlabelled__ != null && (
            <span className="text-[10px] text-gray-400 font-medium tabular-nums">{counts.__unlabelled__}</span>
          )}
        </label>

        {filtered.map((label) => (
          <label
            key={label._id}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={selected.includes(label._id)}
              onChange={() => toggleLabel(label._id)}
              className="sr-only peer"
            />
            <div className="w-[18px] h-[18px] rounded border-2 border-gray-200 peer-checked:border-purple-500 peer-checked:bg-purple-500 transition-all flex items-center justify-center flex-shrink-0">
              {selected.includes(label._id) && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <div
              className="w-3 h-3 rounded-full flex-shrink-0 border"
              style={{ backgroundColor: label.color || '#6B7280', borderColor: label.color ? label.color + '60' : '#D1D5DB' }}
            />
            <span className="text-sm text-gray-700 truncate flex-1">{label.name}</span>
            {counts[label._id] != null && (
              <span className="text-[10px] text-gray-400 font-medium tabular-nums">{counts[label._id]}</span>
            )}
          </label>
        ))}

        {filtered.length === 0 && labels.length > 0 && (
          <p className="text-xs text-gray-400 px-2 py-2 text-center">No matching labels</p>
        )}
        {labels.length === 0 && (
          <p className="text-xs text-gray-400 px-2 py-2 text-center">No labels in this project</p>
        )}
      </div>
    </div>
  );
});

LabelFilter.displayName = 'LabelFilter';
export default LabelFilter;
