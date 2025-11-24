import mongoose from 'mongoose';

const activitySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'card_created',
      'card_updated',
      'card_moved',
      'card_deleted',
      'card_archived',
      'comment_added',
      'member_added',
      'member_removed',
      'attachment_added',
      'due_date_changed',
      'list_created',
      'list_updated',
      'board_created',
      'estimation_updated',
      'time_logged',
      'title_changed',
      'description_changed',
      'status_changed',
      'priority_changed',
      'subtask_created',
      'subtask_completed',
      'subtask_deleted'
    ],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  board: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board'
  },
  card: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Card'
  },
  list: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'List'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false
});

// Indexes
activitySchema.index({ board: 1, createdAt: -1 });
activitySchema.index({ card: 1, createdAt: -1 });
activitySchema.index({ user: 1, createdAt: -1 });

// TTL index - auto-delete activities older than 90 days
activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

export default mongoose.model('Activity', activitySchema);