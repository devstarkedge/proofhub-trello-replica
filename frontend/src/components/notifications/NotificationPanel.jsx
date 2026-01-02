import React, { useRef, useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, CheckCircle, Trash2, Archive, X, Filter,
  FolderPlus, ArrowRight, UserPlus, AlertCircle, Folder,
  MessageSquare, Clock, AlertTriangle, Megaphone, ArchiveRestore, RotateCcw,
  CheckCircle2, XCircle, Settings, User
} from 'lucide-react';
import NotificationCard from './NotificationCard';
import NotificationSkeleton from './NotificationSkeleton';

// Get notification icon and styling based on type (same as NotificationCard)
const getNotificationStyle = (type) => {
  const styles = {
    task_created: { icon: FolderPlus, bg: 'from-green-400 to-emerald-500' },
    task_assigned: { icon: UserPlus, bg: 'from-purple-400 to-violet-500' },
    task_updated: { icon: CheckCircle, bg: 'from-orange-400 to-amber-500' },
    task_completed: { icon: CheckCircle2, bg: 'from-green-500 to-emerald-600' },
    task_deleted: { icon: Trash2, bg: 'from-red-400 to-rose-500' },
    task_moved: { icon: ArrowRight, bg: 'from-blue-400 to-cyan-500' },
    task_due_soon: { icon: Clock, bg: 'from-amber-400 to-orange-500' },
    task_overdue: { icon: AlertTriangle, bg: 'from-red-500 to-rose-600' },
    deadline_approaching: { icon: Clock, bg: 'from-amber-400 to-orange-500' },
    comment_added: { icon: MessageSquare, bg: 'from-blue-400 to-indigo-500' },
    comment_mention: { icon: AlertCircle, bg: 'from-yellow-400 to-orange-500' },
    project_created: { icon: Folder, bg: 'from-indigo-400 to-blue-500' },
    project_deleted: { icon: Trash2, bg: 'from-red-400 to-rose-500' },
    announcement_created: { icon: Megaphone, bg: 'from-pink-400 to-rose-500' },
    user_registered: { icon: User, bg: 'from-teal-400 to-cyan-500' },
    user_verified: { icon: CheckCircle2, bg: 'from-green-400 to-emerald-500' },
    user_approved: { icon: CheckCircle2, bg: 'from-green-400 to-emerald-500' },
    user_declined: { icon: XCircle, bg: 'from-red-400 to-rose-500' },
    reminder_due_soon: { icon: Bell, bg: 'from-teal-400 to-cyan-500' },
    reminder_sent: { icon: Bell, bg: 'from-blue-400 to-indigo-500' },
    status_change: { icon: ArrowRight, bg: 'from-purple-400 to-indigo-500' },
    system_alert: { icon: AlertTriangle, bg: 'from-red-500 to-rose-600' },
    test_notification: { icon: Settings, bg: 'from-gray-400 to-slate-500' }
  };
  return styles[type] || { icon: Bell, bg: 'from-gray-400 to-slate-500' };
};

const NotificationPanel = ({
  notifications,
  unreadCount,
  isLoading,
  hasMore,
  filter,
  onFilterChange,
  onMarkAsRead,
  onMarkAllAsRead,
  onArchive,
  onClearAll,
  onLoadMore,
  onClose,
  onNotificationClick,
  archivedNotifications = [],
  isLoadingArchived = false,
  hasMoreArchived = false,
  onLoadArchived,
  onRestoreNotification,
  onDeletePermanently
}) => {
  const scrollContainerRef = useRef(null);
  const loadMoreRef = useRef(null);
  const [showArchived, setShowArchived] = useState(false);
  const archivedLoadedRef = useRef(false);
  
  // Track if we've done initial load (to decide between skeleton vs overlay)
  const hasInitiallyLoaded = notifications.length > 0 || !isLoading;

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !showArchived && hasMore && !isLoading) {
          onLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoading, onLoadMore, showArchived]);

  // Load archived notifications when switching to archived view (only once)
  useEffect(() => {
    if (showArchived && onLoadArchived && !archivedLoadedRef.current && !isLoadingArchived) {
      archivedLoadedRef.current = true;
      onLoadArchived(true);
    }
  }, [showArchived, onLoadArchived, isLoadingArchived]);

  // Group notifications by date
  const groupNotificationsByDate = (notificationsList) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups = {
      today: [],
      yesterday: [],
      earlier: []
    };

    notificationsList.forEach(notification => {
      const date = new Date(showArchived ? notification.archivedAt : notification.createdAt);
      if (date.toDateString() === today.toDateString()) {
        groups.today.push(notification);
      } else if (date.toDateString() === yesterday.toDateString()) {
        groups.yesterday.push(notification);
      } else {
        groups.earlier.push(notification);
      }
    });

    return groups;
  };

  const currentNotifications = showArchived ? archivedNotifications : notifications;
  const groupedNotifications = groupNotificationsByDate(currentNotifications);
  const currentLoading = showArchived ? isLoadingArchived : isLoading;

  const filterTabs = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread', count: unreadCount },
    { id: 'mentions', label: 'Mentions' },
    { id: 'tasks', label: 'Tasks' }
  ];

  // Get filter-specific empty state messages
  const getEmptyStateTitle = () => {
    switch (filter) {
      case 'unread': return 'All caught up!';
      case 'mentions': return 'No mentions';
      case 'tasks': return 'No task notifications';
      default: return 'All caught up!';
    }
  };

  const getEmptyStateMessage = () => {
    switch (filter) {
      case 'unread': return 'You have no unread notifications';
      case 'mentions': return 'No one has mentioned you yet';
      case 'tasks': return 'No task-related notifications';
      default: return 'You have no notifications';
    }
  };

  const handleArchiveToggle = () => {
    setShowArchived(!showArchived);
  };

  const renderArchivedNotificationCard = (notification, index) => {
    const style = getNotificationStyle(notification.type);
    const IconComponent = style.icon;
    
    return (
      <motion.div
        key={`archived-${notification._id}`}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20, height: 0 }}
        transition={{ duration: 0.2, delay: index * 0.03 }}
        className="group p-4 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-start gap-3">
          {/* Icon with type-based color */}
          <div className={`flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br ${style.bg} flex items-center justify-center shadow-lg`}>
            <IconComponent size={18} className="text-white" />
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm line-clamp-1">
              {notification.title || 'Notification'}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mt-0.5 leading-relaxed">
              {notification.message}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                <Archive size={12} />
                Archived {new Date(notification.archivedAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          
          {/* Actions - Always visible */}
          <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => onRestoreNotification?.(notification._id)}
              className="p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors"
              title="Restore"
            >
              <RotateCcw size={16} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => onDeletePermanently?.(notification._id)}
              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
              title="Delete permanently"
            >
              <Trash2 size={16} />
            </motion.button>
          </div>
        </div>
      </motion.div>
    );
  };

  const renderNotificationGroup = (label, items) => {
    if (items.length === 0) return null;

    return (
      <div key={label}>
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700 sticky top-0 z-10">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {label}
          </span>
        </div>
        <AnimatePresence initial={false}>
          {showArchived ? (
            items.map((notification, index) => renderArchivedNotificationCard(notification, index))
          ) : (
            items.map((notification, index) => (
              <NotificationCard
                key={`active-${label}-${notification._id}`}
                notification={notification}
                index={index}
                onMarkAsRead={onMarkAsRead}
                onArchive={onArchive}
                onClick={onNotificationClick}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      className="notification-panel absolute right-0 top-full mt-2 w-[420px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl z-50 overflow-hidden"
    >
      {/* Header */}
      <div 
        className="notification-header p-4 border-b border-gray-100 dark:border-gray-800"
        style={{
          background: showArchived 
            ? 'linear-gradient(to right, #6b7280, #4b5563, #374151)'
            : 'linear-gradient(to right, #6366f1, #a855f7, #ec4899)'
        }}
      >
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                {showArchived ? (
                  <Archive size={18} className="text-white" />
                ) : (
                  <Bell size={18} className="text-white" />
                )}
              </div>
              <h3 className="font-bold text-white text-lg">
                {showArchived ? 'Archived' : 'Notifications'}
              </h3>
            </div>
            {!showArchived && unreadCount > 0 && (
              <span className="px-3 py-1 bg-white/20 backdrop-blur-sm text-white text-sm font-medium rounded-full border border-white/30">
                {unreadCount} new
              </span>
            )}
            {showArchived && (
              <span className="px-3 py-1 bg-white/20 backdrop-blur-sm text-white text-sm font-medium rounded-full border border-white/30">
                {archivedNotifications.length} items
              </span>
            )}
          </div>

          {/* Action buttons */}
          {!showArchived && notifications.length > 0 && (
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllAsRead}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white text-xs font-medium rounded-lg transition-all border border-white/20"
                >
                  <CheckCircle size={14} />
                  Mark all read
                </button>
              )}
              <button
                onClick={onClearAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-red-500/50 backdrop-blur-sm text-white text-xs font-medium rounded-lg transition-all border border-white/20"
              >
                <Archive size={14} />
                Clear all
              </button>
            </div>
          )}
          
          {showArchived && (
            <button
              onClick={() => setShowArchived(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white text-xs font-medium rounded-lg transition-all border border-white/20"
            >
              <ArrowRight size={14} className="rotate-180" />
              Back to notifications
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
        {!showArchived && filterTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onFilterChange(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              filter === tab.id
                ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-xs rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        ))}
        
        {showArchived && (
          <div className="flex items-center gap-2 px-2 py-1">
            <Archive size={14} className="text-gray-500" />
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Archived Notifications
            </span>
          </div>
        )}
        
        {/* Archive Icon Tab - Always visible at the end */}
        <div className="flex-1" />
        <button
          onClick={handleArchiveToggle}
          className={`flex items-center justify-center p-2 rounded-lg transition-all ${
            showArchived
              ? 'bg-gray-700 text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
          title={showArchived ? 'Back to notifications' : 'View archived'}
        >
          {showArchived ? (
            <Bell size={16} />
          ) : (
            <Archive size={16} />
          )}
        </button>
      </div>

      {/* Notification List */}
      <div
        ref={scrollContainerRef}
        className="max-h-[450px] overflow-y-auto notification-scroll relative"
      >
        {/* Loading overlay for filter switches (when we already have data) */}
        {currentLoading && hasInitiallyLoaded && (
          <div className="absolute inset-0 bg-white/60 dark:bg-gray-900/60 backdrop-blur-[1px] z-20 flex items-center justify-center">
            <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        
        {/* Skeleton loaders - only on very first load when we have no idea about data */}
        {currentLoading && !hasInitiallyLoaded && currentNotifications.length === 0 ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {[...Array(5)].map((_, i) => (
              <NotificationSkeleton key={i} />
            ))}
          </div>
        ) : currentNotifications.length === 0 && !currentLoading ? (
          // Empty state - show immediately when not loading and no data
          <div className="p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center">
              {showArchived ? (
                <Archive size={36} className="text-gray-400" />
              ) : (
                <Bell size={36} className="text-gray-400" />
              )}
            </div>
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">
              {showArchived ? 'No archived notifications' : getEmptyStateTitle()}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {showArchived 
                ? 'Archived notifications will appear here' 
                : getEmptyStateMessage()}
            </p>
          </div>
        ) : (
          <>
            {renderNotificationGroup('Today', groupedNotifications.today)}
            {renderNotificationGroup('Yesterday', groupedNotifications.yesterday)}
            {renderNotificationGroup('Earlier', groupedNotifications.earlier)}

            {/* Load more trigger */}
            <div ref={loadMoreRef} className="h-1" />

            {/* Loading more indicator */}
            {currentLoading && currentNotifications.length > 0 && (
              <div className="p-4 flex justify-center">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* End of list */}
            {!showArchived && !hasMore && currentNotifications.length > 0 && (
              <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                You've reached the end
              </div>
            )}
            {showArchived && !hasMoreArchived && currentNotifications.length > 0 && (
              <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                No more archived notifications
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
};

export default NotificationPanel;
