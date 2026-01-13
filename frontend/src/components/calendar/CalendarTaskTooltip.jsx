import React, { memo } from 'react';
import { motion } from 'framer-motion';
import {
  Calendar,
  User,
  FolderOpen,
  Clock,
  AlertCircle,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';

const CalendarTaskTooltip = memo(({ task, position = { x: 0, y: 0 } }) => {
  if (!task) return null;

  const formatDate = (date) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getPriorityInfo = (priority) => {
    switch (priority) {
      case 'critical':
        return { color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30', label: 'Critical' };
      case 'high':
        return { color: 'text-orange-500', bg: 'bg-orange-100 dark:bg-orange-900/30', label: 'High' };
      case 'medium':
        return { color: 'text-yellow-500', bg: 'bg-yellow-100 dark:bg-yellow-900/30', label: 'Medium' };
      case 'low':
        return { color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/30', label: 'Low' };
      default:
        return null;
    }
  };

  const priorityInfo = getPriorityInfo(task.priority);
  const startDate = formatDate(task.startDate);
  const dueDate = formatDate(task.dueDate);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className="absolute z-50 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4 min-w-[280px] max-w-[320px]"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translateX(-50%)'
      }}
    >
      {/* Arrow */}
      <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white dark:bg-gray-800 border-l border-t border-gray-200 dark:border-gray-700 rotate-45" />

      {/* Task Title */}
      <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-3 pr-4 line-clamp-2">
        {task.title}
      </h4>

      {/* Project Name */}
      {task.project?.name && (
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-2">
          <FolderOpen className="w-3.5 h-3.5 text-blue-500" />
          <span className="truncate">{task.project.name}</span>
        </div>
      )}

      {/* Assignees */}
      {task.assignees && task.assignees.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-2">
          <User className="w-3.5 h-3.5 text-purple-500" />
          <div className="flex items-center gap-1 flex-wrap">
            {task.assignees.slice(0, 3).map((assignee, idx) => (
              <span key={assignee._id || idx} className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300">
                {assignee.name?.split(' ')[0] || 'Unknown'}
              </span>
            ))}
            {task.assignees.length > 3 && (
              <span className="text-gray-400">+{task.assignees.length - 3}</span>
            )}
          </div>
        </div>
      )}

      {/* Date Range */}
      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-2">
        <Calendar className="w-3.5 h-3.5 text-green-500" />
        <div className="flex items-center gap-1">
          {startDate && (
            <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
              {startDate}
            </span>
          )}
          {startDate && dueDate && <ArrowRight className="w-3 h-3 text-gray-400" />}
          {dueDate && (
            <span className={`px-1.5 py-0.5 rounded ${
              task.isOverdue 
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
            }`}>
              {dueDate}
            </span>
          )}
          {!startDate && !dueDate && (
            <span className="text-gray-400 italic">No dates set</span>
          )}
        </div>
      </div>

      {/* Status */}
      {task.listTitle && (
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-2">
          <Clock className="w-3.5 h-3.5 text-indigo-500" />
          <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full font-medium">
            {task.listTitle}
          </span>
        </div>
      )}

      {/* Priority Badge */}
      {priorityInfo && (
        <div className="flex items-center gap-2 text-xs mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <AlertCircle className={`w-3.5 h-3.5 ${priorityInfo.color}`} />
          <span className={`${priorityInfo.bg} ${priorityInfo.color} px-2 py-0.5 rounded-full font-medium`}>
            {priorityInfo.label} Priority
          </span>
        </div>
      )}

      {/* Overdue Warning */}
      {task.isOverdue && (
        <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 mt-2 bg-red-50 dark:bg-red-900/20 px-2 py-1.5 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5" />
          <span className="font-medium">Task is overdue!</span>
        </div>
      )}
    </motion.div>
  );
});

CalendarTaskTooltip.displayName = 'CalendarTaskTooltip';

export default CalendarTaskTooltip;
