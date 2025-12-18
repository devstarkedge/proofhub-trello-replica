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
      'card_restored',
      'comment_added',
      'comment_updated',
      'comment_deleted',
      'member_added',
      'member_removed',
      'attachment_added',
      'attachments_added',
      'attachment_deleted',
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
      'subtask_deleted',
      'subtask_updated',
      'subtask_moved',
      'nano_created',
      'nano_updated',
      'nano_completed',
      'nano_deleted',
      'nano_moved',
      // Recurrence activity types
      'recurrence_created',
      'recurrence_updated',
      'recurrence_deleted',
      'recurrence_stopped',
      'recurrence_triggered',
      'recurrence_paused',
      'recurrence_resumed'
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
  // Context - determines what type of item this activity belongs to
  contextType: {
    type: String,
    enum: ['task', 'subtask', 'nanoSubtask', 'card'],
    default: 'task',
    required: true
  },
  // References to all hierarchy levels
  board: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board'
  },
  card: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Card'
  },
  subtask: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subtask'
  },
  nanoSubtask: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubtaskNano'
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
    default: Date.now,
    index: true
  }
}, {
  timestamps: false
});

// Indexes for efficient filtering
activitySchema.index({ board: 1, createdAt: -1 });
activitySchema.index({ card: 1, createdAt: -1 });
activitySchema.index({ subtask: 1, createdAt: -1 });
activitySchema.index({ nanoSubtask: 1, createdAt: -1 });
activitySchema.index({ contextType: 1, createdAt: -1 });
activitySchema.index({ user: 1, createdAt: -1 });
activitySchema.index({ card: 1, subtask: 1, createdAt: -1 });
activitySchema.index({ subtask: 1, nanoSubtask: 1, createdAt: -1 });

// TTL index - auto-delete activities older than 90 days
activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

export default mongoose.model('Activity', activitySchema);