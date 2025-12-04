import React, { useState, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, Calendar, Clock, ChevronRight, AlertCircle,
  CheckCircle2, AlertTriangle, Plus, Send, User
} from 'lucide-react';
import Database from '../services/database';

/**
 * ReminderPanel - Flexible panel for displaying reminder info
 * Supports compact mode for EditProjectModal and full mode for standalone use
 */
const ReminderPanel = memo(({ 
  projectId, 
  clientInfo, 
  onOpenReminderModal,
  compact = false,
  className = '' 
}) => {
  const [stats, setStats] = useState(null);
  const [nextReminder, setNextReminder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchReminderStats = useCallback(async () => {
    if (!projectId) return;
    
    try {
      setLoading(true);
      setError(null);
      const response = await Database.getProjectReminderStats(projectId);
      if (response.success) {
        setStats(response.data);
        setNextReminder(response.data.nextReminder);
      }
    } catch (err) {
      console.error('Error fetching reminder stats:', err);
      setError('Failed to load reminder data');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchReminderStats();
  }, [fetchReminderStats]);

  // Get status color and icon based on reminder state
  const getStatusDisplay = () => {
    if (!nextReminder) {
      return {
        color: 'text-gray-500',
        bgColor: 'bg-gray-100',
        borderColor: 'border-gray-200',
        icon: Bell,
        label: 'No reminder set',
        badge: null
      };
    }

    const now = new Date();
    const reminderDate = new Date(nextReminder.scheduledDate);
    const hoursUntil = (reminderDate - now) / (1000 * 60 * 60);

    if (hoursUntil < 0) {
      return {
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        icon: AlertCircle,
        label: 'Overdue',
        badge: 'overdue'
      };
    } else if (hoursUntil <= 24) {
      return {
        color: 'text-orange-600',
        bgColor: 'bg-orange-50',
        borderColor: 'border-orange-200',
        icon: AlertTriangle,
        label: 'Due soon',
        badge: 'due-soon'
      };
    } else {
      return {
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        icon: CheckCircle2,
        label: 'Scheduled',
        badge: 'upcoming'
      };
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const statusDisplay = getStatusDisplay();
  const StatusIcon = statusDisplay.icon;

  // Compact loading state
  if (loading) {
    if (compact) {
      return (
        <div className={`flex items-center gap-3 mt-4 pt-4 border-t border-indigo-200/40 ${className}`}>
          <div className="animate-pulse flex items-center gap-2 flex-1">
            <div className="h-4 w-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-24"></div>
          </div>
        </div>
      );
    }
    return (
      <div className={`animate-pulse bg-gray-100 rounded-xl p-4 ${className}`}>
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
        <div className="h-6 bg-gray-200 rounded w-2/3"></div>
      </div>
    );
  }

  // Compact error state
  if (error) {
    if (compact) {
      return (
        <div className={`flex items-center gap-2 mt-4 pt-4 border-t border-red-200/40 text-red-600 text-xs ${className}`}>
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      );
    }
    return (
      <div className={`bg-red-50 border border-red-200 rounded-xl p-4 ${className}`}>
        <p className="text-red-600 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      </div>
    );
  }

  // Compact mode for inside EditProjectModal reminder section
  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`mt-4 pt-4 border-t border-indigo-200/40 ${className}`}
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Status indicator */}
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${statusDisplay.bgColor} ${statusDisplay.borderColor} border`}>
              <StatusIcon className={`h-4 w-4 ${statusDisplay.color}`} />
              <span className={`text-sm font-medium ${statusDisplay.color}`}>
                {statusDisplay.label}
              </span>
            </div>
            
            {nextReminder && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="h-4 w-4 text-indigo-500" />
                <span className="font-medium">{formatDate(nextReminder.scheduledDate)}</span>
              </div>
            )}
          </div>

          {/* Stats badges */}
          <div className="flex items-center gap-3">
            {stats?.upcoming > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg">
                <Bell className="h-3.5 w-3.5" />
                {stats.upcoming} pending
              </span>
            )}
            {stats?.completed > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-lg">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {stats.completed} sent
              </span>
            )}
          </div>
        </div>

        {/* Client info preview */}
        {clientInfo?.clientName && (
          <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
            <User className="h-3.5 w-3.5" />
            <span>Reminders for: <span className="font-medium text-gray-700">{clientInfo.clientName}</span></span>
            {clientInfo?.clientEmail && (
              <>
                <span className="text-gray-300">•</span>
                <span>{clientInfo.clientEmail}</span>
              </>
            )}
          </div>
        )}
      </motion.div>
    );
  }

  // Full panel mode (standalone usage)
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${statusDisplay.bgColor} border ${statusDisplay.borderColor} rounded-2xl p-4 cursor-pointer transition-all hover:shadow-md ${className}`}
      onClick={onOpenReminderModal}
      role="button"
      tabIndex={0}
      aria-label="Open reminder settings"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenReminderModal();
        }
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl bg-white shadow-sm ${statusDisplay.color}`}>
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-gray-900">Client Reminder</h4>
              {stats?.upcoming > 0 && (
                <span 
                  className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 text-xs font-bold text-white bg-indigo-600 rounded-full"
                  aria-label={`${stats.upcoming} pending reminders`}
                >
                  {stats.upcoming}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusIcon className={`h-3.5 w-3.5 ${statusDisplay.color}`} />
              <span className={`text-xs font-medium ${statusDisplay.color}`}>
                {statusDisplay.label}
              </span>
              {nextReminder && (
                <>
                  <span className="text-gray-300">•</span>
                  <span className="text-xs text-gray-600 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(nextReminder.scheduledDate)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {!nextReminder && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onOpenReminderModal();
              }}
              aria-label="Set new reminder"
            >
              <Plus className="h-3.5 w-3.5" />
              Set Reminder
            </motion.button>
          )}
          <ChevronRight className={`h-5 w-5 ${statusDisplay.color}`} />
        </div>
      </div>

      {/* Quick Stats Row */}
      {stats && (stats.completed > 0 || stats.missed > 0) && (
        <div className="mt-3 pt-3 border-t border-gray-200/50 flex items-center gap-4 text-xs">
          {stats.completed > 0 && (
            <div className="flex items-center gap-1.5 text-green-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{stats.completed} completed</span>
            </div>
          )}
          {stats.missed > 0 && (
            <div className="flex items-center gap-1.5 text-red-600">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>{stats.missed} missed</span>
            </div>
          )}
          {stats.successRatio > 0 && (
            <div className="flex items-center gap-1.5 text-gray-600 ml-auto">
              <Clock className="h-3.5 w-3.5" />
              <span>{stats.successRatio}% success rate</span>
            </div>
          )}
        </div>
      )}

      {/* Badge indicators */}
      <AnimatePresence>
        {statusDisplay.badge && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute -top-2 -right-2"
          >
            {statusDisplay.badge === 'overdue' && (
              <span className="flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
            )}
            {statusDisplay.badge === 'due-soon' && (
              <span className="flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

ReminderPanel.displayName = 'ReminderPanel';

export default ReminderPanel;
