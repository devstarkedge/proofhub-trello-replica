import React, { useState, useEffect } from 'react';

const MentionList = ({ items = [], command }) => {
  const [selected, setSelected] = useState(0);

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      setSelected((s) => Math.min(s + 1, items.length - 1));
      return true;
    }
    if (event.key === 'ArrowUp') {
      setSelected((s) => Math.max(s - 1, 0));
      return true;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (items[selected]) command(items[selected]);
      return true;
    }
    return false;
  };

  // Reset selection when items change
  useEffect(() => {
    setSelected(0);
  }, [items]);

  return (
    <div className="bg-white border rounded shadow-md overflow-hidden w-56">
      {items.length === 0 ? (
        <div className="px-3 py-2 text-sm text-gray-500">No users found</div>
      ) : (
        items.map((item, idx) => (
          <div
            key={item.id || `mention-${idx}`}
            onClick={() => command(item)}
            className={`px-3 py-2 cursor-pointer text-sm flex items-center gap-2 ${
              idx === selected ? 'bg-blue-50' : 'hover:bg-gray-50'
            }`}
          >
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
              {item.label?.[0]?.toUpperCase() || '?'}
            </div>
            <span className="flex-1 truncate">{item.label}</span>
          </div>
        ))
      )}
    </div>
  );
};

export default MentionList;