import React, { memo, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import CalendarChip from './CalendarChip';
import ReminderTooltip from './ReminderTooltip';

/**
 * CalendarCell - Individual date cell in the calendar grid
 * Shows project chips and badges for dates with reminders
 */
const CalendarCell = memo(({
  dateInfo,
  reminders = [],
  isToday,
  isSelected,
  onClick,
  onReminderClick
}) => {
  const { day, isCurrentMonth, date } = dateInfo;

  // Get unique projects from reminders
  const projectChips = useMemo(() => {
    const projectMap = new Map();
    reminders.forEach(reminder => {
      const projectId = reminder.project?._id;
      if (projectId && !projectMap.has(projectId)) {
        projectMap.set(projectId, {
          id: projectId,
          name: reminder.project?.name || 'Project',
          status: reminder.status
        });
      }
    });
    return Array.from(projectMap.values());
  }, [reminders]);

  // Color assignment for chips based on project index
  const chipColors = ['indigo', 'blue', 'purple', 'teal', 'pink', 'orange', 'green'];
  
  const getChipColor = useCallback((index) => {
    return chipColors[index % chipColors.length];
  }, []);

  // Calculate status indicators
  const statusInfo = useMemo(() => {
    const hasOverdue = reminders.some(r => {
      return r.status === 'pending' && new Date(r.scheduledDate) < new Date();
    });
    const hasDueSoon = reminders.some(r => {
      if (r.status !== 'pending') return false;
      const scheduledDate = new Date(r.scheduledDate);
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      return scheduledDate <= tomorrow && scheduledDate > now;
    });
    const hasCompleted = reminders.some(r => r.status === 'completed');

    return { hasOverdue, hasDueSoon, hasCompleted };
  }, [reminders]);

  // Determine how many chips to show
  const maxVisibleChips = 2;
  const visibleChips = projectChips.slice(0, maxVisibleChips);
  const hiddenCount = projectChips.length - maxVisibleChips;

  // Cell styling based on state
  const cellClasses = useMemo(() => {
    let base = `
      relative flex flex-col min-h-[90px] p-1.5 rounded-xl
      transition-all duration-200 cursor-pointer
      border-2 overflow-hidden group
    `;

    if (!isCurrentMonth) {
      base += ' opacity-40';
    }

    if (isSelected) {
      base += ' border-indigo-500 bg-indigo-50 shadow-lg shadow-indigo-500/20';
    } else if (isToday) {
      base += ' border-indigo-300 bg-gradient-to-br from-indigo-50 to-purple-50';
    } else if (reminders.length > 0) {
      base += ' border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md';
    } else {
      base += ' border-transparent bg-white/50 hover:bg-white hover:border-gray-200';
    }

    return base;
  }, [isCurrentMonth, isSelected, isToday, reminders.length]);

  const cellContent = (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cellClasses}
    >
      {/* Date number and status indicators */}
      <div className="flex items-start justify-between mb-1">
        <span className={`
          text-sm font-semibold
          ${isToday ? 'text-indigo-700' : isCurrentMonth ? 'text-gray-900' : 'text-gray-400'}
        `}>
          {day}
        </span>

        {/* Reminder count badge */}
        {reminders.length > 0 && (
          <span className={`
            flex items-center justify-center
            min-w-[20px] h-5 px-1.5 rounded-full
            text-[10px] font-bold
            ${statusInfo.hasOverdue 
              ? 'bg-red-500 text-white' 
              : statusInfo.hasDueSoon 
                ? 'bg-orange-500 text-white'
                : 'bg-indigo-500 text-white'
            }
          `}>
            {reminders.length}
          </span>
        )}
      </div>

      {/* Today indicator */}
      {isToday && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2">
          <span className="text-[8px] font-bold text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
            Today
          </span>
        </div>
      )}

      {/* Project chips */}
      {reminders.length > 0 && (
        <div className="flex-1 flex flex-col justify-end gap-0.5 mt-1">
          {visibleChips.map((project, index) => (
            <CalendarChip
              key={project.id}
              label={project.name}
              color={getChipColor(index)}
              size="xs"
              onClick={(e) => {
                e.stopPropagation();
                onReminderClick?.(reminders.find(r => r.project?._id === project.id));
              }}
            />
          ))}
          
          {/* Hidden chips indicator */}
          {hiddenCount > 0 && (
            <span className="
              text-[9px] font-medium text-gray-500
              bg-gray-100 px-1.5 py-0.5 rounded-full
              self-start mt-0.5
            ">
              +{hiddenCount} more
            </span>
          )}
        </div>
      )}

      {/* Status indicator dots (for cells without chips visible) */}
      {reminders.length > 0 && visibleChips.length === 0 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          {statusInfo.hasOverdue && (
            <span className="h-2 w-2 rounded-full bg-red-500" />
          )}
          {statusInfo.hasDueSoon && (
            <span className="h-2 w-2 rounded-full bg-orange-500" />
          )}
          {!statusInfo.hasOverdue && !statusInfo.hasDueSoon && (
            <span className="h-2 w-2 rounded-full bg-indigo-500" />
          )}
        </div>
      )}

      {/* Hover glow effect */}
      <div className="
        absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100
        bg-gradient-to-br from-indigo-500/5 to-purple-500/5
        transition-opacity duration-300 pointer-events-none
      " />
    </motion.div>
  );

  // Wrap with tooltip if there are reminders
  if (reminders.length > 0) {
    return (
      <ReminderTooltip
        reminders={reminders}
        date={date}
      >
        {cellContent}
      </ReminderTooltip>
    );
  }

  return cellContent;
});

CalendarCell.displayName = 'CalendarCell';

export default CalendarCell;
