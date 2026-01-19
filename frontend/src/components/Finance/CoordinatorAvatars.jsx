import React, { useState } from 'react';
import { Users } from 'lucide-react';

/**
 * CoordinatorAvatars - Avatar stack component for displaying project coordinators
 * Shows first 2 avatars + overflow count
 * On hover: Shows dropdown with full list
 */
const CoordinatorAvatars = ({ coordinators = [], maxVisible = 2 }) => {
  const [showDropdown, setShowDropdown] = useState(false);

  if (!coordinators || coordinators.length === 0) {
    return (
      <span 
        className="text-xs"
        style={{ color: 'var(--color-text-muted)' }}
      >
        No coordinators
      </span>
    );
  }

  const visibleCoordinators = coordinators.slice(0, maxVisible);
  const remainingCount = coordinators.length - maxVisible;

  // Generate avatar color from name
  const getAvatarColor = (name) => {
    const colors = [
      { bg: 'rgba(239, 68, 68, 0.2)', text: '#ef4444' },
      { bg: 'rgba(59, 130, 246, 0.2)', text: '#3b82f6' },
      { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981' },
      { bg: 'rgba(139, 92, 246, 0.2)', text: '#8b5cf6' },
      { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b' },
      { bg: 'rgba(236, 72, 153, 0.2)', text: '#ec4899' },
      { bg: 'rgba(6, 182, 212, 0.2)', text: '#06b6d4' }
    ];
    const index = (name || '').charCodeAt(0) % colors.length;
    return colors[index];
  };

  // Get initials from name
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div 
      className="relative flex items-center"
      onMouseEnter={() => setShowDropdown(true)}
      onMouseLeave={() => setShowDropdown(false)}
    >
      {/* Avatar Stack */}
      <div className="flex -space-x-2">
        {visibleCoordinators.map((coordinator, index) => {
          const color = getAvatarColor(coordinator.name);
          
          return (
            <div
              key={coordinator._id || index}
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium border-2 transition-transform hover:scale-110 hover:z-10"
              style={{
                backgroundColor: color.bg,
                color: color.text,
                borderColor: 'var(--color-bg-secondary)',
                zIndex: visibleCoordinators.length - index
              }}
              title={coordinator.name}
            >
              {coordinator.avatar ? (
                <img 
                  src={coordinator.avatar} 
                  alt={coordinator.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                getInitials(coordinator.name)
              )}
            </div>
          );
        })}
        
        {/* Overflow Count */}
        {remainingCount > 0 && (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium border-2"
            style={{
              backgroundColor: 'var(--color-bg-muted)',
              color: 'var(--color-text-secondary)',
              borderColor: 'var(--color-bg-secondary)'
            }}
          >
            +{remainingCount}
          </div>
        )}
      </div>

      {/* Hover Dropdown */}
      {showDropdown && coordinators.length > 0 && (
        <div 
          className="absolute left-0 top-full mt-2 p-3 rounded-xl border z-50 min-w-48"
          style={{
            backgroundColor: '#ffffff',
            borderColor: '#e5e7eb',
            boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.2), 0 4px 20px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05)'
          }}
        >
          <div className="flex items-center gap-2 mb-2 pb-2" style={{ borderBottom: '1px solid #e5e7eb' }}>
            <Users className="w-4 h-4" style={{ color: '#10b981' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Coordinators ({coordinators.length})
            </span>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {coordinators.map((coordinator, index) => {
              const color = getAvatarColor(coordinator.name);
              
              return (
                <div 
                  key={coordinator._id || index}
                  className="flex items-center gap-2"
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                    style={{
                      backgroundColor: color.bg,
                      color: color.text
                    }}
                  >
                    {coordinator.avatar ? (
                      <img 
                        src={coordinator.avatar} 
                        alt={coordinator.name}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      getInitials(coordinator.name)
                    )}
                  </div>
                  <div className="min-w-0">
                    <p 
                      className="text-xs font-medium truncate"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {coordinator.name}
                    </p>
                    {coordinator.email && (
                      <p 
                        className="text-xs truncate"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        {coordinator.email}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CoordinatorAvatars;
