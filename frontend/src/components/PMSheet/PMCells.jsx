import React, { useState } from 'react';
import { User } from 'lucide-react';

/**
 * CoordinatorDisplay - Shows coordinators with avatar stack and hover dropdown
 * Shows up to 2 coordinators as names, more as avatar stack
 */
const CoordinatorDisplay = ({ 
  coordinators = [], 
  maxVisible = 2,
  showNames = true,
  size = 'md',
  className = '' 
}) => {
  const [isHovered, setIsHovered] = useState(false);

  if (!coordinators || coordinators.length === 0) {
    return <span className="text-gray-400 text-sm">-</span>;
  }

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base'
  };

  const avatarSize = sizeClasses[size] || sizeClasses.md;
  const visibleCoordinators = coordinators.slice(0, maxVisible);
  const remainingCount = coordinators.length - maxVisible;

  // If 2 or fewer, show names
  if (coordinators.length <= maxVisible && showNames) {
    return (
      <div className={`flex flex-wrap gap-1 ${className}`}>
        {coordinators.map((coordinator, index) => (
          <span 
            key={coordinator._id || coordinator.id || index}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-xs font-medium"
          >
            {coordinator.avatar ? (
              <img 
                src={coordinator.avatar} 
                alt={coordinator.name} 
                className="w-4 h-4 rounded-full object-cover"
              />
            ) : (
              <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px]">
                {coordinator.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}
            <span className="text-gray-700 dark:text-gray-300 truncate max-w-[80px]">
              {coordinator.name}
            </span>
          </span>
        ))}
      </div>
    );
  }

  // Show avatar stack for more than maxVisible
  return (
    <div 
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Avatar stack */}
      <div className="flex -space-x-2">
        {visibleCoordinators.map((coordinator, index) => (
          <div
            key={coordinator._id || coordinator.id || index}
            className={`${avatarSize} rounded-full border-2 border-white dark:border-gray-800 overflow-hidden`}
            style={{ zIndex: maxVisible - index }}
          >
            {coordinator.avatar ? (
              <img 
                src={coordinator.avatar} 
                alt={coordinator.name} 
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-medium">
                {coordinator.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}
          </div>
        ))}
        {remainingCount > 0 && (
          <div 
            className={`${avatarSize} rounded-full border-2 border-white dark:border-gray-800 bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 font-medium`}
          >
            +{remainingCount}
          </div>
        )}
      </div>

      {/* Hover dropdown */}
      {isHovered && (
        <div className="absolute z-50 top-full left-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 max-h-64 overflow-auto">
          <div className="px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700 mb-1">
            Coordinators ({coordinators.length})
          </div>
          {coordinators.map((coordinator, index) => (
            <div 
              key={coordinator._id || coordinator.id || index}
              className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {coordinator.avatar ? (
                <img 
                  src={coordinator.avatar} 
                  alt={coordinator.name} 
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-medium">
                  {coordinator.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {coordinator.name}
                </div>
                {coordinator.email && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {coordinator.email}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * UserCell - Table cell component for displaying user info
 */
export const UserCell = ({ user, showEmail = false, showAvatar = true, className = '' }) => {
  if (!user) {
    return <span className="text-gray-400">-</span>;
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showAvatar && (
        user.avatar || user.userAvatar ? (
          <img 
            src={user.avatar || user.userAvatar} 
            alt={user.name || user.userName} 
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-medium text-sm">
            {(user.name || user.userName)?.charAt(0)?.toUpperCase() || '?'}
          </div>
        )
      )}
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {user.name || user.userName}
        </div>
        {showEmail && (user.email || user.userEmail) && (
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {user.email || user.userEmail}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * TimeCell - Table cell component for displaying time values
 */
export const TimeCell = ({ time, variant = 'default', className = '' }) => {
  if (!time) {
    return <span className="text-gray-400">0h 0m</span>;
  }

  const display = typeof time === 'string' ? time : time.display || `${time.hours || 0}h ${time.minutes || 0}m`;
  
  const variantClasses = {
    default: 'text-gray-900 dark:text-white',
    success: 'text-green-600 dark:text-green-400',
    warning: 'text-amber-600 dark:text-amber-400',
    muted: 'text-gray-500 dark:text-gray-400'
  };

  return (
    <span className={`font-mono text-sm ${variantClasses[variant]} ${className}`}>
      {display}
    </span>
  );
};

/**
 * PaymentCell - Table cell component for displaying payment values
 */
export const PaymentCell = ({ amount, currency = 'USD', variant = 'default', className = '' }) => {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount || 0);

  const variantClasses = {
    default: 'text-gray-900 dark:text-white',
    success: 'text-green-600 dark:text-green-400 font-semibold',
    large: 'text-lg font-bold text-green-600 dark:text-green-400'
  };

  return (
    <span className={`${variantClasses[variant]} ${className}`}>
      {formatted}
    </span>
  );
};

/**
 * StatusBadge - Displays project status with color coding
 */
export const StatusBadge = ({ status, editable = false, onChange = null, className = '' }) => {
  const [isEditing, setIsEditing] = useState(false);

  const statusConfig = {
    'planning': { 
      label: 'Planning', 
      bg: 'bg-blue-100 dark:bg-blue-900/30', 
      text: 'text-blue-700 dark:text-blue-400' 
    },
    'in-progress': { 
      label: 'In Progress', 
      bg: 'bg-amber-100 dark:bg-amber-900/30', 
      text: 'text-amber-700 dark:text-amber-400' 
    },
    'completed': { 
      label: 'Completed', 
      bg: 'bg-green-100 dark:bg-green-900/30', 
      text: 'text-green-700 dark:text-green-400' 
    },
    'on-hold': { 
      label: 'On Hold', 
      bg: 'bg-gray-100 dark:bg-gray-700', 
      text: 'text-gray-700 dark:text-gray-400' 
    }
  };

  const config = statusConfig[status] || statusConfig['planning'];

  if (editable && isEditing) {
    return (
      <div className="relative">
        <select
          value={status}
          onChange={(e) => {
            onChange && onChange(e.target.value);
            setIsEditing(false);
          }}
          onBlur={() => setIsEditing(false)}
          autoFocus
          className="text-xs font-medium px-2 py-1 rounded-full border-none focus:ring-2 focus:ring-blue-500"
        >
          {Object.entries(statusConfig).map(([value, cfg]) => (
            <option key={value} value={value}>{cfg.label}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <span 
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text} ${editable ? 'cursor-pointer hover:ring-2 hover:ring-blue-500' : ''} ${className}`}
      onClick={() => editable && setIsEditing(true)}
    >
      {config.label}
    </span>
  );
};

/**
 * BillingTypeBadge - Displays billing type (Hourly/Fixed)
 */
export const BillingTypeBadge = ({ type, rate, className = '' }) => {
  const isHourly = type === 'hr' || type === 'hourly';
  
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        isHourly 
          ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
          : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
      }`}>
        {isHourly ? 'Hourly' : 'Fixed'}
      </span>
      {isHourly && rate > 0 && (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          ${rate}/hr
        </span>
      )}
    </div>
  );
};

export default CoordinatorDisplay;
