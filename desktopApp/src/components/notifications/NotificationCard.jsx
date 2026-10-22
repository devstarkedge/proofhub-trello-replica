
import { motion } from 'framer-motion';
import {
  Bell, CheckCircle, Trash2, Archive,
  FolderPlus, ArrowRight, UserPlus, AlertCircle, Folder,
  MessageSquare, Clock, AlertTriangle, Megaphone, User,
  CheckCircle2, XCircle, Settings, Globe
} from 'lucide-react';
import { getNotificationRouteHint } from '../../utils/notificationRouteResolver';

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
    test_notification: { icon: Settings, bg: 'from-gray-400 to-slate-500' },
    sales_tab_approval: { icon: Globe, bg: 'from-amber-400 to-orange-500' },
    sales_tab_result: { icon: CheckCircle2, bg: 'from-green-400 to-emerald-500' },
    sales_tab_alert: { icon: Bell, bg: 'from-amber-400 to-orange-500' },
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
  const routeHint = getNotificationRouteHint(notification);

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
      className={`group relative p-4 border-b border-[var(--color-border-subtle)] cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-inset ${priorityStyle} ${
        !notification.isRead
          ? 'bg-[var(--color-primary-subtle)]'
          : 'hover:bg-[var(--color-bg-muted)] '
      }`}
      tabIndex={0}
      role="button"
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(notification); } }}
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
              <p className={`text-sm font-semibold ${!notification.isRead ? 'text-[var(--color-text-primary)] dark:text-white' : 'text-[var(--color-text-primary)] '} line-clamp-1`}>
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
              <span className="flex-shrink-0 w-3 h-3 bg-[var(--color-primary)] rounded-full animate-pulse ring-2 ring-[var(--color-primary-subtle)] shadow-md" />
            )}
          </div>

          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5 line-clamp-2 leading-relaxed">
            {notification.message}
          </p>

          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1">
              <Clock size={12} />
              {formatTimeAgo(notification.createdAt)}
            </span>
            {notification.sender?.name && (
              <span className="text-xs text-[var(--color-text-muted)]">
                by {notification.sender.name}
              </span>
            )}
            {routeHint && (
              <span className="text-xs text-[var(--color-primary)] ml-auto">
                → {routeHint}
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
                backgroundColor: 'var(--color-primary-subtle)',
                color: 'var(--color-primary)'
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
              backgroundColor: 'var(--color-bg-muted)',
              color: 'var(--color-text-secondary)'
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
