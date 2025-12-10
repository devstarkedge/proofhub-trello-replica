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
      'project_created',
      'project_deleted',
      'comment_added',
      'comment_mention',
      'team_invite',
      'board_shared',
      'user_registered',
      'account_created',
      'user_created',
      'user_assigned',
      'user_unassigned',
      'announcement_created',
      'test_notification',
      'reminder_due_soon',
      'reminder_sent',
      'reminder_completed',
      'reminder_missed',
      'awaiting_client_response',
      'user_verified',
      'user_approved',
      'user_declined'
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
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ isRead: 1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ user: 1, isRead: 1 });

export default mongoose.model('Notification', notificationSchema);