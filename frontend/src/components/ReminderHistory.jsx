import React, { useState, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  History, ChevronDown, ChevronRight, Calendar, User,
  Clock, CheckCircle2, AlertCircle, XCircle, Bell,
  MessageSquare, ArrowRight, Loader
} from 'lucide-react';
import Database from '../services/database';

/**
 * ReminderHistory - Accordion/slide-over component for viewing reminder history
 * Shows timeline of all reminders for a project
 */
const ReminderHistory = memo(({
  projectId,
  isExpanded: controlledExpanded,
  onToggle,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Use controlled state if provided
  const expanded = controlledExpanded !== undefined ? controlledExpanded : isOpen;

  const toggleExpanded = () => {
    if (onToggle) {
      onToggle(!expanded);
    } else {
      setIsOpen(!isOpen);
    }
  };

  const fetchReminders = useCallback(async (pageNum = 1, append = false) => {
    if (!projectId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await Database.getProjectReminders(projectId, {
        page: pageNum,
        limit: 10
      });

      if (response.success) {
        const newReminders = response.data || [];
        if (append) {
          setReminders(prev => [...prev, ...newReminders]);
        } else {
          setReminders(newReminders);
        }
        setHasMore(response.pagination?.page < response.pagination?.pages);
      }
    } catch (err) {
      console.error('Error fetching reminder history:', err);
      setError('Failed to load reminder history');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (expanded && projectId) {
      fetchReminders(1, false);
    }
  }, [expanded, projectId, fetchReminders]);

  const loadMore = () => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchReminders(nextPage, true);
    }
  };

  // Status configuration
  const statusConfig = {
    pending: {
      icon: Clock,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      borderColor: 'border-blue-200',
      label: 'Pending'
    },
    sent: {
      icon: Bell,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-100',
      borderColor: 'border-indigo-200',
      label: 'Sent'
    },
    completed: {
      icon: CheckCircle2,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      borderColor: 'border-green-200',
      label: 'Completed'
    },
    missed: {
      icon: AlertCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      borderColor: 'border-red-200',
      label: 'Missed'
    },
    cancelled: {
      icon: XCircle,
      color: 'text-gray-600',
      bgColor: 'bg-gray-100',
      borderColor: 'border-gray-200',
      label: 'Cancelled'
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatRelativeTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date - now;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} ago`;
    } else if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Tomorrow';
    } else {
      return `In ${diffDays} days`;
    }
  };

  return (
    <div className={`bg-white rounded-2xl border border-gray-200 overflow-hidden ${className}`}>
      {/* Header - Clickable to expand/collapse */}
      <motion.button
        onClick={toggleExpanded}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
        aria-expanded={expanded}
        aria-controls="reminder-history-content"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-xl">
            <History className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-gray-900">Reminder History</h3>
            <p className="text-xs text-gray-500">
              {reminders.length > 0 ? `${reminders.length} reminder${reminders.length !== 1 ? 's' : ''}` : 'View past reminders'}
            </p>
          </div>
        </div>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="h-5 w-5 text-gray-400" />
        </motion.div>
      </motion.button>

      {/* Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            id="reminder-history-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <div className="border-t border-gray-200 p-4">
              {loading && reminders.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader className="h-6 w-6 animate-spin text-indigo-600" />
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              ) : reminders.length === 0 ? (
                <div className="text-center py-8">
                  <History className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No reminders yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Timeline */}
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-[22px] top-0 bottom-0 w-0.5 bg-gray-200" />

                    {reminders.map((reminder, index) => {
                      const config = statusConfig[reminder.status] || statusConfig.pending;
                      const StatusIcon = config.icon;

                      return (
                        <motion.div
                          key={reminder._id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="relative flex gap-4 pb-4 last:pb-0"
                        >
                          {/* Timeline dot */}
                          <div className={`relative z-10 flex-shrink-0 h-11 w-11 rounded-full ${config.bgColor} ${config.borderColor} border-2 flex items-center justify-center`}>
                            <StatusIcon className={`h-5 w-5 ${config.color}`} />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 bg-gray-50 rounded-xl p-3 border border-gray-100">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${config.bgColor} ${config.color}`}>
                                  {config.label}
                                </span>
                                <span className="text-xs text-gray-400">
                                  {formatRelativeTime(reminder.scheduledDate)}
                                </span>
                              </div>
                              {reminder.priority && reminder.priority !== 'medium' && (
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  reminder.priority === 'high' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                }`}>
                                  {reminder.priority}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                              <Calendar className="h-3.5 w-3.5 text-gray-400" />
                              <span>{formatDate(reminder.scheduledDate)}</span>
                            </div>

                            {reminder.client?.name && (
                              <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                                <User className="h-3.5 w-3.5 text-gray-400" />
                                <span>Client: {reminder.client.name}</span>
                              </div>
                            )}

                            {reminder.notes && (
                              <div className="mt-2 flex items-start gap-2">
                                <MessageSquare className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-gray-600 line-clamp-2">{reminder.notes}</p>
                              </div>
                            )}

                            {reminder.createdBy && (
                              <div className="mt-2 pt-2 border-t border-gray-200 flex items-center gap-2">
                                <div className="h-5 w-5 rounded-full bg-indigo-500 flex items-center justify-center text-white text-[10px] font-bold">
                                  {(reminder.createdBy.name || 'U').charAt(0).toUpperCase()}
                                </div>
                                <span className="text-xs text-gray-500">
                                  Created by {reminder.createdBy.name}
                                </span>
                              </div>
                            )}

                            {/* History entries */}
                            {reminder.history && reminder.history.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-gray-200">
                                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Activity</p>
                                <div className="space-y-1">
                                  {reminder.history.slice(0, 3).map((entry, i) => (
                                    <div key={i} className="flex items-center gap-1 text-[10px] text-gray-500">
                                      <ArrowRight className="h-2.5 w-2.5" />
                                      <span className="capitalize">{entry.action}</span>
                                      <span>•</span>
                                      <span>{formatDate(entry.timestamp)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Load More Button */}
                  {hasMore && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={loadMore}
                      disabled={loading}
                      className="w-full py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors disabled:opacity-50"
                    >
                      {loading ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader className="h-4 w-4 animate-spin" />
                          Loading...
                        </span>
                      ) : (
                        'Load More'
                      )}
                    </motion.button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

ReminderHistory.displayName = 'ReminderHistory';

export default ReminderHistory;
