import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, User, FileUp, Edit3, Users, AlertCircle, CheckCircle2, 
  Tag, Calendar, TrendingUp, MessageSquare, Paperclip, History
} from 'lucide-react';

// Format relative time
const formatRelativeTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Activity type configurations
const ACTIVITY_CONFIG = {
  board_created: {
    icon: CheckCircle2,
    color: 'bg-green-100 text-green-600',
    borderColor: 'border-green-300',
    label: 'Project Created'
  },
  project_updated: {
    icon: Edit3,
    color: 'bg-blue-100 text-blue-600',
    borderColor: 'border-blue-300',
    label: 'Project Updated'
  },
  project_status_changed: {
    icon: TrendingUp,
    color: 'bg-purple-100 text-purple-600',
    borderColor: 'border-purple-300',
    label: 'Status Changed'
  },
  project_priority_changed: {
    icon: AlertCircle,
    color: 'bg-orange-100 text-orange-600',
    borderColor: 'border-orange-300',
    label: 'Priority Changed'
  },
  project_member_added: {
    icon: Users,
    color: 'bg-indigo-100 text-indigo-600',
    borderColor: 'border-indigo-300',
    label: 'Member Added'
  },
  project_member_removed: {
    icon: Users,
    color: 'bg-red-100 text-red-600',
    borderColor: 'border-red-300',
    label: 'Member Removed'
  },
  file_uploaded: {
    icon: FileUp,
    color: 'bg-cyan-100 text-cyan-600',
    borderColor: 'border-cyan-300',
    label: 'File Uploaded'
  },
  attachment_uploaded: {
    icon: Paperclip,
    color: 'bg-teal-100 text-teal-600',
    borderColor: 'border-teal-300',
    label: 'Attachment Added'
  },
  attachment_deleted: {
    icon: Paperclip,
    color: 'bg-gray-100 text-gray-600',
    borderColor: 'border-gray-300',
    label: 'Attachment Removed'
  },
  comment_added: {
    icon: MessageSquare,
    color: 'bg-yellow-100 text-yellow-600',
    borderColor: 'border-yellow-300',
    label: 'Comment Added'
  },
  due_date_changed: {
    icon: Calendar,
    color: 'bg-pink-100 text-pink-600',
    borderColor: 'border-pink-300',
    label: 'Due Date Changed'
  },
  label_added: {
    icon: Tag,
    color: 'bg-emerald-100 text-emerald-600',
    borderColor: 'border-emerald-300',
    label: 'Label Added'
  },
  default: {
    icon: History,
    color: 'bg-gray-100 text-gray-600',
    borderColor: 'border-gray-300',
    label: 'Activity'
  }
};

// Single Activity Item
const ActivityItem = ({ activity, index, isLast }) => {
  const config = ACTIVITY_CONFIG[activity.type] || ACTIVITY_CONFIG.default;
  const Icon = config.icon;
  const userName = activity.user?.name || activity.userName || 'System';
  const userAvatar = activity.user?.avatar;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="relative flex gap-4"
    >
      {/* Timeline connector */}
      {!isLast && (
        <div className="absolute left-5 top-12 w-0.5 h-[calc(100%-1rem)] bg-gradient-to-b from-gray-200 to-transparent" />
      )}

      {/* Icon */}
      <div className={`relative z-10 flex-shrink-0 w-10 h-10 rounded-xl ${config.color} flex items-center justify-center shadow-sm`}>
        <Icon size={18} />
      </div>

      {/* Content */}
      <div className="flex-1 pb-6">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-gray-900">{activity.description}</p>
            <div className="flex items-center gap-2 mt-1">
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt={userName}
                  className="w-5 h-5 rounded-full object-cover"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-semibold">
                  {userName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-xs text-gray-500">{userName}</span>
              <span className="text-gray-300">•</span>
              <span className="text-xs text-gray-400">
                {formatRelativeTime(activity.createdAt)}
              </span>
            </div>
          </div>
          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${config.color}`}>
            {config.label}
          </span>
        </div>

        {/* Metadata display */}
        {activity.metadata && (
          <div className="mt-2 p-2 bg-gray-50 rounded-lg text-xs text-gray-600">
            {activity.metadata.from && activity.metadata.to && (
              <p>
                Changed from <span className="font-medium">{activity.metadata.from}</span> to{' '}
                <span className="font-medium">{activity.metadata.to}</span>
              </p>
            )}
            {activity.metadata.fileName && (
              <p>
                File: <span className="font-medium">{activity.metadata.fileName}</span>
              </p>
            )}
            {activity.metadata.added && activity.metadata.added.length > 0 && (
              <p>Added {activity.metadata.added.length} member(s)</p>
            )}
            {activity.metadata.removed && activity.metadata.removed.length > 0 && (
              <p>Removed {activity.metadata.removed.length} member(s)</p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

// Main Activity Timeline Component
const ActivityTimeline = ({
  activities = [],
  loading = false,
  projectCreatedAt,
  projectCreatedBy,
  projectUpdatedAt,
  maxItems = 50,
  className = ''
}) => {
  // Enhance activities with creation info if not present
  const enhancedActivities = useMemo(() => {
    const items = [...activities];
    
    // Add creation activity if not present and we have creation info
    if (projectCreatedAt && !items.some(a => a.type === 'board_created')) {
      items.push({
        _id: 'creation',
        type: 'board_created',
        description: 'Project was created',
        user: projectCreatedBy ? { name: projectCreatedBy } : null,
        createdAt: projectCreatedAt
      });
    }

    // Sort by date descending
    return items
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, maxItems);
  }, [activities, projectCreatedAt, projectCreatedBy, maxItems]);

  return (
    <div className={`${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <History size={16} className="text-indigo-600" />
          Activity Timeline
        </h4>
        {enhancedActivities.length > 0 && (
          <span className="text-xs text-gray-500">
            {enhancedActivities.length} {enhancedActivities.length === 1 ? 'event' : 'events'}
          </span>
        )}
      </div>

      {/* Timeline */}
      <div className="relative">
        {loading ? (
          <div className="flex flex-col gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4 animate-pulse">
                <div className="w-10 h-10 rounded-xl bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : enhancedActivities.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gray-100 flex items-center justify-center">
              <History size={24} className="text-gray-400" />
            </div>
            <p className="text-sm text-gray-500">No activity recorded yet</p>
            <p className="text-xs text-gray-400 mt-1">Activity will appear here as the project is updated</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {enhancedActivities.map((activity, index) => (
              <ActivityItem
                key={activity._id || index}
                activity={activity}
                index={index}
                isLast={index === enhancedActivities.length - 1}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Last Updated Info */}
      {projectUpdatedAt && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 flex items-center gap-2">
            <Clock size={12} />
            Last updated {formatRelativeTime(projectUpdatedAt)}
          </p>
        </div>
      )}
    </div>
  );
};

export default ActivityTimeline;
