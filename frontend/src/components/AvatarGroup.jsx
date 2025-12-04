import React, { useState, useRef, useEffect, memo } from 'react';

const AvatarGroup = memo(function AvatarGroup({ assignees = [] }) {
  const [hovered, setHovered] = useState(false);
  const dropdownRef = useRef(null);
  const avatarBarRef = useRef(null);

  // Hide tooltip on mouse leave
  useEffect(() => {
    if (!hovered) return;
    function handleMouseLeave(event) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.relatedTarget) &&
        avatarBarRef.current &&
        !avatarBarRef.current.contains(event.relatedTarget)
      ) {
        setHovered(false);
      }
    }
    const bar = avatarBarRef.current;
    const drop = dropdownRef.current;
    if (bar) bar.addEventListener('mouseleave', handleMouseLeave);
    if (drop) drop.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      if (bar) bar.removeEventListener('mouseleave', handleMouseLeave);
      if (drop) drop.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [hovered]);

  if (assignees.length === 0) {
    return (
      <span className="text-gray-400 italic flex items-center gap-2">
        <div className="p-1.5 bg-gray-100 rounded-lg">
          <span className="font-bold text-gray-500">?</span>
        </div>
        Unassigned
      </span>
    );
  }

  if (assignees.length <= 2) {
    return (
      <div className="flex items-center gap-2.5 flex-wrap">
        {assignees.map((assignee, idx) => (
          <div key={assignee._id || idx} className="flex items-center gap-1">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg">
              {assignee.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-gray-700 font-medium">{assignee.name}</span>
          </div>
        ))}
      </div>
    );
  }

  // More than 2 assignees: collapsed avatar bar + hover tooltip
  return (
    <div className="relative flex items-center">
      <div
        ref={avatarBarRef}
        className="flex -space-x-3 cursor-pointer"
        tabIndex={0}
        aria-label="Show all assignees"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {assignees.slice(0, 3).map((assignee, idx) => (
          <div
            key={assignee._id || idx}
            className={`w-8 h-8 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg border-2 border-white transition-transform duration-200 z-0`}
            style={{ left: `-${idx * 12}px` }}
          >
            {assignee.name.charAt(0).toUpperCase()}
          </div>
        ))}
      </div>
      <span className="ml-4 text-gray-700 font-medium select-none">
        {assignees.length} members
      </span>
      {/* Hover Tooltip List */}
      {hovered && (
        <div
          ref={dropdownRef}
          className="absolute left-0 top-full mt-2 min-w-[120px] bg-white rounded-lg shadow-lg z-[9999] p-2 space-y-1 border border-gray-100 text-xs animate-fade-in"
          style={{
            opacity: hovered ? 1 : 0,
            transform: hovered ? 'scale(1)' : 'scale(0.95)',
            transition: 'opacity 150ms, transform 150ms',
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <ul>
            {assignees.map((assignee, idx) => (
              <li key={assignee._id || idx} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-blue-50 transition-colors">
                <div className="w-6 h-6 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-[0.8rem] font-bold shadow">
                  {assignee.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-gray-900 font-medium truncate max-w-[80px]">{assignee.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});

export default AvatarGroup;
