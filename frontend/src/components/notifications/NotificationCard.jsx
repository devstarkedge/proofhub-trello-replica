import React from 'react';
import { motion } from 'framer-motion';
import {
  Bell, CheckCircle, Trash2, Archive,
  FolderPlus, ArrowRight, UserPlus, AlertCircle, Folder,
  MessageSquare, Clock, AlertTriangle, Megaphone, User,
  CheckCircle2, XCircle, Settings
} from 'lucide-react';

// Get notification icon and styling based on type
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

// Get priority styling
const getPriorityStyle = (priority) => {
  const styles = {
    critical: 'border-l-4 border-l-red-500',
    high: 'border-l-4 border-l-orange-500',
    medium: '',
    low: 'opacity-90'
  };
  return styles[priority] || '';
};

// Format relative time
const formatTimeAgo = (date) => {
  const now = new Date();
  const diff = now - new Date(date);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
};

const NotificationCard = ({
  notification,
  index,
  onMarkAsRead,
  onArchive,
  onClick
}) => {
  const style = getNotificationStyle(notification.type);
  const IconComponent = style.icon;
  const priorityStyle = getPriorityStyle(notification.priority);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
        delay: index * 0.02
      }}
      className={`group relative p-4 border-b border-gray-50 dark:border-gray-800 cursor-pointer transition-all duration-200 ${priorityStyle} ${
        !notification.isRead
          ? 'bg-gradient-to-r from-blue-50/80 to-indigo-50/50 dark:from-blue-900/20 dark:to-indigo-900/10'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
      onClick={() => onClick(notification)}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br ${style.bg} flex items-center justify-center shadow-lg`}>
          <IconComponent size={18} className="text-white" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className={`text-sm font-semibold ${!notification.isRead ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'} line-clamp-1`}>
                {notification.title}
              </p>
              {notification.priority === 'critical' && (
                <span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 text-xs font-bold rounded">
                  URGENT
                </span>
              )}
              {notification.priority === 'high' && (
                <span className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400 text-xs font-medium rounded">
                  High
                </span>
              )}
            </div>
            {!notification.isRead && (
              <span className="flex-shrink-0 w-3 h-3 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full animate-pulse ring-2 ring-blue-200 dark:ring-blue-400/30 shadow-md shadow-blue-500/40 dark:shadow-blue-500/50" />
            )}
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
            {notification.message}
          </p>

          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
              <Clock size={12} />
              {formatTimeAgo(notification.createdAt)}
            </span>
            {notification.sender?.name && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                by {notification.sender.name}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Hover Actions - Only visible on hover */}
      <div 
        className="notification-actions absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1"
        style={{ 
          opacity: 0,
          visibility: 'hidden',
          transition: 'opacity 0.2s ease, visibility 0.2s ease',
          pointerEvents: 'none'
        }}
      >
        <div className="flex items-center gap-1" style={{ pointerEvents: 'auto' }}>
          {!notification.isRead && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={(e) => {
                e.stopPropagation();
                onMarkAsRead(notification._id);
              }}
              className="p-2 rounded-lg transition-colors"
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: '#2563eb'
              }}
              title="Mark as read"
            >
              <CheckCircle size={14} />
            </motion.button>
          )}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={(e) => {
              e.stopPropagation();
              onArchive(notification._id);
            }}
            className="p-2 rounded-lg transition-colors"
            style={{
              backgroundColor: 'rgba(107, 114, 128, 0.15)',
              color: '#4b5563'
            }}
            title="Archive"
          >
            <Archive size={14} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
};

export default NotificationCard;
