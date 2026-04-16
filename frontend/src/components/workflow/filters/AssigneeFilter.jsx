import React, { memo, useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import Avatar from '../../Avatar';

const AssigneeFilter = memo(({ assignees, selected, onChange, counts = {} }) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return assignees;
    const q = search.toLowerCase();
    return assignees.filter(a => (a.name || '').toLowerCase().includes(q) || (a.email || '').toLowerCase().includes(q));
  }, [assignees, search]);

  const toggleAssignee = (id) => {
    if (selected.includes(id)) {
      onChange(selected.filter(a => a !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const isUnassignedSelected = selected.includes('__unassigned__');

  return (
    <div className="space-y-2">
      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search members..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-300 focus:border-purple-300 transition-colors"
        />
      </div>

      <div className="space-y-0.5 max-h-48 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {/* Unassigned option */}
        <label className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
          <input
            type="checkbox"
            checked={isUnassignedSelected}
            onChange={() => toggleAssignee('__unassigned__')}
            className="sr-only peer"
          />
          <div className="w-[18px] h-[18px] rounded border-2 border-gray-200 peer-checked:border-purple-500 peer-checked:bg-purple-500 transition-all flex items-center justify-center flex-shrink-0">
            {isUnassignedSelected && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
            <span className="text-[9px] font-bold text-gray-500">?</span>
          </div>
          <span className="text-sm text-gray-500 italic flex-1">Unassigned</span>
          {counts.__unassigned__ != null && (
            <span className="text-[10px] text-gray-400 font-medium tabular-nums">{counts.__unassigned__}</span>
          )}
        </label>

        {/* User list */}
        {filtered.map((user) => (
          <label
            key={user._id}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={selected.includes(user._id)}
              onChange={() => toggleAssignee(user._id)}
              className="sr-only peer"
            />
            <div className="w-[18px] h-[18px] rounded border-2 border-gray-200 peer-checked:border-purple-500 peer-checked:bg-purple-500 transition-all flex items-center justify-center flex-shrink-0">
              {selected.includes(user._id) && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <Avatar src={user.avatar} name={user.name} size="xs" showBadge={false} />
            <span className="text-sm text-gray-700 truncate flex-1">{user.name || user.email || 'Unknown'}</span>
            {counts[user._id] != null && (
              <span className="text-[10px] text-gray-400 font-medium tabular-nums">{counts[user._id]}</span>
            )}
          </label>
        ))}

        {filtered.length === 0 && assignees.length > 0 && (
          <p className="text-xs text-gray-400 px-2 py-2 text-center">No matching members</p>
        )}
        {assignees.length === 0 && (
          <p className="text-xs text-gray-400 px-2 py-2 text-center">No assignees in this project</p>
        )}
      </div>
    </div>
  );
});

AssigneeFilter.displayName = 'AssigneeFilter';
export default AssigneeFilter;
