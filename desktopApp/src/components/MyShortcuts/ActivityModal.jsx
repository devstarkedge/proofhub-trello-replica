import React, { memo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Activity, Filter, Calendar, ChevronRight, ChevronDown,
  Clock, FileText, MessageSquare, Users, Paperclip, AlertCircle,
  RefreshCw, CheckCircle
} from 'lucide-react';
import useMyShortcutsStore from '../../store/myShortcutsStore';

const ActivityModal = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { activities, activityPagination, loading, errors, fetchActivities, activityFilters } = useMyShortcutsStore();
  
  const [selectedType, setSelectedType] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const activityTypes = [
    { value: 'all', label: 'All Activities' },
    { value: 'card_created', label: 'Tasks Created' },
    { value: 'card_updated', label: 'Tasks Updated' },
    { value: 'comment_added', label: 'Comments' },
    { value: 'time_logged', label: 'Time Logged' },
    { value: 'subtask_created', label: 'Subtasks' },
    { value: 'attachment_added', label: 'Attachments' }
  ];

  const getActivityIcon = (type) => {
    const icons = {
      card_created: FileText,
      card_updated: FileText,
      card_moved: FileText,
      comment_added: MessageSquare,
      comment_updated: MessageSquare,
      member_added: Users,
      member_removed: Users,
      attachment_added: Paperclip,
      time_logged: Clock,
      subtask_created: CheckCircle,
      subtask_completed: CheckCircle,
      default: Activity
    };
    return icons[type] || icons.default;
  };

  const getActivityColor = (type) => {
    const colors = {
      card_created: 'bg-green-100 text-green-600',
      card_updated: 'bg-blue-100 text-blue-600',
      card_moved: 'bg-purple-100 text-purple-600',
      comment_added: 'bg-yellow-100 text-yellow-600',
      time_logged: 'bg-emerald-100 text-emerald-600',
      subtask_created: 'bg-cyan-100 text-cyan-600',
      subtask_completed: 'bg-green-100 text-green-600',
      attachment_added: 'bg-orange-100 text-orange-600',
      default: 'bg-gray-100 text-gray-600'
    };
    return colors[type] || colors.default;
  };

  const formatDate = (date) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  };

  const handleFilterChange = useCallback((type) => {
    setSelectedType(type);
    fetchActivities({ type, page: 1 });
  }, [fetchActivities]);

  const handleDateFilter = useCallback(() => {
    fetchActivities({
      type: selectedType,
      startDate: dateRange.start,
      endDate: dateRange.end,
      page: 1
    });
  }, [fetchActivities, selectedType, dateRange]);

  const handleLoadMore = useCallback(() => {
    if (activityPagination.page < activityPagination.pages) {
      fetchActivities({ page: activityPagination.page + 1 }, true);
    }
  }, [fetchActivities, activityPagination]);

  const handleActivityClick = useCallback((activity) => {
    const nav = activity.navigationContext;
    if (nav) {
      onClose();
      if (nav.type === 'task' && nav.departmentId && nav.projectId && nav.taskId) {
        navigate(`/workflow/${nav.departmentId}/${nav.projectId}/${nav.taskId}`);
      } else if (nav.type === 'project' && nav.departmentId && nav.projectId) {
        navigate(`/workflow/${nav.departmentId}/${nav.projectId}`);
      }
    }
  }, [navigate, onClose]);

  useEffect(() => {
    if (isOpen) {
      fetchActivities({ page: 1 });
    }
  }, [isOpen, fetchActivities]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <Activity className="text-white" size={20} />
            </div>
            My Activity
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-gray-100 bg-gray-50 space-y-3">
          {/* Type Filter */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            <Filter size={16} className="text-gray-400 flex-shrink-0" />
            {activityTypes.map((type) => (
              <button
                key={type.value}
                onClick={() => handleFilterChange(type.value)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  selectedType === type.value
                    ? 'bg-purple-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-gray-400" />
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
            />
            <span className="text-gray-400">to</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
            />
            <button
              onClick={handleDateFilter}
              className="px-3 py-1.5 bg-purple-500 text-white rounded-lg text-sm hover:bg-purple-600 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>

        {/* Activity List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading.activities && activities.length === 0 ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-start gap-3 p-3 animate-pulse">
                  <div className="w-10 h-10 bg-gray-200 rounded-xl"></div>
                  <div className="flex-1">
                    <div className="w-3/4 h-4 bg-gray-200 rounded mb-2"></div>
                    <div className="w-1/2 h-3 bg-gray-200 rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : errors.activities ? (
            <div className="text-center py-12 text-red-500">
              <AlertCircle size={40} className="mx-auto mb-3" />
              <p>Failed to load activities</p>
              <button
                onClick={() => fetchActivities({ page: 1 })}
                className="mt-3 text-purple-600 hover:underline"
              >
                Try again
              </button>
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Activity size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No activities found</p>
              <p className="text-sm mt-1">Your recent actions will appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activities.map((activity, index) => {
                const Icon = getActivityIcon(activity.type);
                const colorClass = getActivityColor(activity.type);
                
                return (
                  <motion.div
                    key={activity._id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={() => handleActivityClick(activity)}
                    className={`flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 transition-all group ${
                      activity.navigationContext ? 'cursor-pointer' : ''
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 text-sm">
                        {activity.description}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                        <Clock size={12} />
                        <span>{formatDate(activity.createdAt)}</span>
                        {activity.card?.title && (
                          <>
                            <span>•</span>
                            <span className="text-purple-500 truncate">{activity.card.title}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {activity.navigationContext && (
                      <ChevronRight 
                        size={18} 
                        className="text-gray-400 group-hover:text-purple-500 group-hover:translate-x-1 transition-all flex-shrink-0" 
                      />
                    )}
                  </motion.div>
                );
              })}

              {/* Load More */}
              {activityPagination.page < activityPagination.pages && (
                <button
                  onClick={handleLoadMore}
                  disabled={loading.activities}
                  className="w-full py-3 text-sm text-purple-600 hover:bg-purple-50 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {loading.activities ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      Loading...
                    </>
                  ) : (
                    `Load more (${activityPagination.total - activities.length} remaining)`
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 text-center text-sm text-gray-500">
          Showing {activities.length} of {activityPagination.total} activities
        </div>
      </motion.div>
    </motion.div>
  );
};

export default memo(ActivityModal);
