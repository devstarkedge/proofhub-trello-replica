import mongoose from 'mongoose';
import workspaceScopePlugin from '../modules/workspaces/workspaceScopePlugin.js';

const activitySchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: [
      'board_created',
      'board_updated',
      'project_created',
      'project_updated',
      'project_status_changed',
      'project_priority_changed',
      'project_member_added',
      'project_member_removed',
      'project_file_uploaded',
      'project_file_deleted',
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
      'attachment_restored',
      'attachment_permanently_deleted',
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
      'recurrence_resumed',
      // Copy/Move activity types
      'card_copied',
      'subtask_promoted'
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
    enum: ['task', 'subtask', 'nanoSubtask', 'card', 'board'],
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
    default: Date.now
    // No field-level index: true here — it would register a second,
    // conflicting index under the same auto-generated name as the
    // explicit TTL index below (same {createdAt:1} key, different
    // options), which is exactly the pre-existing conflict syncIndexes()
    // surfaced during the workspace migration. The TTL index (and the
    // workspaceId-led compounds below) already cover every createdAt query.
  }
}, {
  timestamps: false
});

// Indexes for efficient filtering
activitySchema.index({ workspaceId: 1, board: 1, createdAt: -1 });
activitySchema.index({ workspaceId: 1, card: 1, createdAt: -1 });
activitySchema.index({ workspaceId: 1, subtask: 1, createdAt: -1 });
activitySchema.index({ workspaceId: 1, nanoSubtask: 1, createdAt: -1 });
activitySchema.index({ workspaceId: 1, contextType: 1, createdAt: -1 });
activitySchema.index({ workspaceId: 1, user: 1, createdAt: -1 });
activitySchema.index({ workspaceId: 1, card: 1, subtask: 1, createdAt: -1 });
activitySchema.index({ workspaceId: 1, subtask: 1, nanoSubtask: 1, createdAt: -1 });

// TTL index - auto-delete activities older than 90 days
activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

activitySchema.plugin(workspaceScopePlugin);

export default mongoose.model('Activity', activitySchema);