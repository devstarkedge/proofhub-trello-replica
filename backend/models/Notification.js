import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'task_assigned',
      'task_updated',
      'task_due_soon',
      'task_overdue',
      'task_created',
      'task_deleted',
      'task_moved',
      'task_completed',
      'project_created',
      'project_deleted',
      'project_updates',
      'comment_added',
      'comment_mention',
      'comment_reaction',
      'comment_reply',
      'comment_pinned',
      'role_mention',
      'team_mention',
      'team_invite',
      'board_shared',
      'user_registered',
      'account_created',
      'user_created',
      'user_assigned',
      'user_unassigned',
      'announcement_created',
      'module_access',
      'test_notification',
      'reminder_due_soon',
      'reminder_sent',
      'reminder_completed',
      'reminder_missed',
      'awaiting_client_response',
      'user_verified',
      'user_approved',
      'user_declined',
      'deadline_approaching',
      'status_change',
      'system_alert'
    ],
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Enhanced entity tracking
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'entityType'
  },
  entityType: {
    type: String,
    enum: ['Card', 'Board', 'Comment', 'User', 'Announcement', 'Reminder', 'Team', 'Department', 'Subtask', 'SubtaskNano', null],
    default: null
  },
  action: {
    type: String,
    trim: true,
    default: null
  },
  // Priority levels
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  // Legacy reference fields (kept for backward compatibility)
  relatedCard: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Card'
  },
  relatedBoard: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board'
  },
  relatedTeam: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team'
  },
  // Read state
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  // Archive/soft delete
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedAt: {
    type: Date
  },
  // Flexible metadata for additional context
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Deep linking for comment navigation
  deepLink: {
    commentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment'
    },
    contextType: {
      type: String,
      enum: ['card', 'subtask', 'subtaskNano', 'announcement', null],
      default: null
    },
    contextRef: {
      type: mongoose.Schema.Types.ObjectId
    },
    highlightDuration: {
      type: Number,
      default: 3000 // 3 seconds highlight
    },
    threadParentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment'
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isRead: 1 });
notificationSchema.index({ user: 1, isArchived: 1, createdAt: -1 });
notificationSchema.index({ user: 1, priority: 1, createdAt: -1 });
notificationSchema.index({ isRead: 1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ entityId: 1, entityType: 1 });

export default mongoose.model('Notification', notificationSchema);
