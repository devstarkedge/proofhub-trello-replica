import React, { useState, useRef, useEffect, memo } from 'react';
import ReactDOM from 'react-dom';
import Avatar from './Avatar';

const AvatarGroup = memo(function AvatarGroup({ assignees = [] }) {
  const [hovered, setHovered] = useState(false);
  const dropdownRef = useRef(null);
  const avatarBarRef = useRef(null);

  // Hide tooltip on mouse leave
  // Improved hover logic: closes only when mouse leaves both avatar and dropdown
  useEffect(() => {
    if (!hovered) return;
    function handleMouseMove(event) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        avatarBarRef.current &&
        !avatarBarRef.current.contains(event.target)
      ) {
        setHovered(false);
      }
    }
    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
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
            <Avatar 
              src={assignee?.avatar} 
              name={assignee?.name} 
              size="sm"
              showBadge={false}
            />
            <span className="text-gray-700 font-medium">{assignee?.name || 'Unknown'}</span>
          </div>
        ))}
      </div>
    );
  }

  // More than 2 assignees: collapsed avatar bar + hover tooltip
  return (
    <div className="flex items-center" style={{ position: 'relative', zIndex: 1 }}>
      <div
        ref={avatarBarRef}
        className="flex -space-x-3 cursor-pointer"
        tabIndex={0}
        aria-label="Show all assignees"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ zIndex: 2 }}
      >
        {assignees.slice(0, 3).map((assignee, idx) => (
          <div
            key={assignee._id || idx}
            style={{ left: `-${idx * 12}px` }}
            className="z-0"
          >
            <Avatar 
              src={assignee?.avatar} 
              name={assignee?.name} 
              size="sm"
              showBadge={false}
            />
          </div>
        ))}
      </div>
      <span className="ml-4 text-gray-700 font-medium select-none">
        {assignees.length} members
      </span>
      {/* Hover Tooltip List in Portal */}
      {hovered && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          className="fixed left-0 top-0 z-[9999] pointer-events-auto"
          style={{
            minWidth: '140px',
            background: 'white',
            borderRadius: '0.75rem',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            border: '1px solid #e5e7eb',
            padding: '0.5rem 0.75rem',
            fontSize: '0.95rem',
            maxHeight: '220px',
            overflowY: 'auto',
            transition: 'opacity 150ms, transform 150ms',
            opacity: hovered ? 1 : 0,
            transform: hovered ? 'scale(1)' : 'scale(0.97)',
            left: avatarBarRef.current ? (avatarBarRef.current.getBoundingClientRect().left) : 0,
            top: avatarBarRef.current ? (avatarBarRef.current.getBoundingClientRect().bottom + 6) : 0,
          }}
        >
          <ul>
            {assignees.map((assignee, idx) => (
              <li key={assignee._id || idx} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-blue-50 transition-colors">
                <Avatar 
                  src={assignee?.avatar} 
                  name={assignee?.name} 
                  size="xs"
                  showBadge={false}
                />
                <span className="text-gray-900 font-medium truncate max-w-[80px]">{assignee?.name || 'Unknown'}</span>
              </li>
            ))}
          </ul>
        </div>,
        document.body
      )}
    </div>
  );
});

export default AvatarGroup;
