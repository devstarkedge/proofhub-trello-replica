import React, { memo, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Repeat, AlertTriangle } from 'lucide-react';
import CalendarTaskTooltip from './CalendarTaskTooltip';

/**
 * CalendarTask - Custom task rendering component for FullCalendar
 * Displays tasks with visual indicators for start/due dates, overdue status, and recurring tasks
 */
const CalendarTask = memo(({ task, variant = 'default', onClick }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const taskRef = useRef(null);
  const hoverTimeoutRef = useRef(null);

  // Determine which indicator to show based on what's being displayed
  const indicatorType = task.indicators?.[0] || 'due';
  const isStart = indicatorType === 'start';
  const isDue = indicatorType === 'due';
  const isOverdue = task.isOverdue;
  const isRecurring = task.hasRecurrence;

  // Color schemes
  const getColors = () => {
    if (isOverdue) {
      return {
        bg: 'bg-gradient-to-r from-red-500 to-red-600',
        border: 'border-red-600',
        text: 'text-white',
        dot: 'bg-red-200'
      };
    }
    if (isStart) {
      return {
        bg: 'bg-gradient-to-r from-blue-500 to-blue-600',
        border: 'border-blue-600',
        text: 'text-white',
        dot: 'bg-blue-200'
      };
    }
    if (isDue) {
      return {
        bg: 'bg-gradient-to-r from-green-500 to-green-600',
        border: 'border-green-600',
        text: 'text-white',
        dot: 'bg-green-200'
      };
    }
    return {
      bg: 'bg-gradient-to-r from-gray-500 to-gray-600',
      border: 'border-gray-600',
      text: 'text-white',
      dot: 'bg-gray-200'
    };
  };

  const colors = getColors();

  // Handle mouse enter with delay
  const handleMouseEnter = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      if (taskRef.current) {
        const rect = taskRef.current.getBoundingClientRect();
        setTooltipPosition({
          x: rect.left + rect.width / 2,
          y: rect.bottom + 10
        });
        setShowTooltip(true);
      }
    }, 300); // 300ms delay before showing tooltip
  };

  // Handle mouse leave
  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setShowTooltip(false);
  };

  // Compact variant for month view
  if (variant === 'compact') {
    return (
      <>
        <motion.div
          ref={taskRef}
          whileHover={{ scale: 1.02 }}
          className={`
            flex items-center gap-1.5 px-2 py-0.5 rounded-md cursor-pointer
            ${colors.bg} ${colors.text} text-xs font-medium truncate
            shadow-sm hover:shadow-md transition-shadow
          `}
          onClick={() => onClick?.(task)}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Start/Due indicator dot */}
          <span className={`w-1.5 h-1.5 rounded-full ${colors.dot} flex-shrink-0`} />
          
          {/* Task title */}
          <span className="truncate">{task.title}</span>
          
          {/* Badges */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {isOverdue && <AlertTriangle className="w-3 h-3" />}
            {isRecurring && <Repeat className="w-3 h-3" />}
          </div>
        </motion.div>

        {/* Tooltip Portal */}
        {showTooltip && createPortal(
          <AnimatePresence>
            <CalendarTaskTooltip task={task} position={tooltipPosition} />
          </AnimatePresence>,
          document.body
        )}
      </>
    );
  }

  // Default variant (week/day view)
  return (
    <>
      <motion.div
        ref={taskRef}
        whileHover={{ scale: 1.01 }}
        className={`
          flex items-start gap-2 p-2 rounded-lg cursor-pointer
          ${colors.bg} ${colors.text}
          shadow-sm hover:shadow-md transition-all
          border-l-4 ${colors.border}
        `}
        onClick={() => onClick?.(task)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Left indicator */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
          {task.indicators?.length > 1 && (
            <span className={`w-1 h-6 rounded-full ${colors.dot} opacity-50`} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-medium text-sm line-clamp-2">{task.title}</h4>
            
            {/* Badges */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {isOverdue && (
                <span className="p-1 bg-white/20 rounded">
                  <AlertTriangle className="w-3.5 h-3.5" />
                </span>
              )}
              {isRecurring && (
                <span className="p-1 bg-white/20 rounded">
                  <Repeat className="w-3.5 h-3.5" />
                </span>
              )}
            </div>
          </div>

          {/* Meta info */}
          <div className="flex items-center gap-2 mt-1 text-xs opacity-80">
            {task.project?.name && (
              <span className="truncate max-w-[100px]">{task.project.name}</span>
            )}
            {task.assignees?.length > 0 && (
              <span className="bg-white/20 px-1.5 py-0.5 rounded">
                {task.assignees.length} assignee{task.assignees.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Date indicator label */}
          <div className="mt-1.5">
            <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded-full">
              {isStart ? '⏳ Start' : isDue ? '⏰ Due' : '📅'}
              {isOverdue && ' (Overdue)'}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Tooltip Portal */}
      {showTooltip && createPortal(
        <AnimatePresence>
          <CalendarTaskTooltip task={task} position={tooltipPosition} />
        </AnimatePresence>,
        document.body
      )}
    </>
  );
});

CalendarTask.displayName = 'CalendarTask';

export default CalendarTask;
