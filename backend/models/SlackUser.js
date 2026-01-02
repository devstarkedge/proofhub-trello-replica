import mongoose from 'mongoose';

const slackUserSchema = new mongoose.Schema({
  // Link to FlowTask user
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Slack workspace reference
  workspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SlackWorkspace',
    required: true,
    index: true
  },

  // Slack user identifiers
  slackUserId: {
    type: String,
    required: true,
    index: true
  },
  slackUsername: {
    type: String
  },
  slackDisplayName: {
    type: String
  },
  slackEmail: {
    type: String
  },
  slackAvatar: {
    type: String
  },
  slackTimezone: {
    type: String,
    default: 'UTC'
  },
  slackTimezoneOffset: {
    type: Number,
    default: 0
  },

  // User-specific Slack preferences
  preferences: {
    // Notification channels
    notificationsEnabled: { type: Boolean, default: true },
    directMessageEnabled: { type: Boolean, default: true },
    
    // Notification types
    taskAssigned: { type: Boolean, default: true },
    taskUpdated: { type: Boolean, default: true },
    taskCompleted: { type: Boolean, default: true },
    taskDeleted: { type: Boolean, default: true },
    taskOverdue: { type: Boolean, default: true },
    taskDueSoon: { type: Boolean, default: true },
    commentAdded: { type: Boolean, default: true },
    commentMention: { type: Boolean, default: true },
    subtaskUpdates: { type: Boolean, default: true },
    projectUpdates: { type: Boolean, default: true },
    teamUpdates: { type: Boolean, default: true },
    announcements: { type: Boolean, default: true },
    reminders: { type: Boolean, default: true },
    statusChanges: { type: Boolean, default: true },
    
    // Digest preferences
    digestEnabled: { type: Boolean, default: false },
    digestFrequency: { 
      type: String, 
      enum: ['hourly', 'daily', 'weekly', 'never'], 
      default: 'never' 
    },
    digestTime: { type: String, default: '09:00' },
    
    // Quiet hours (overrides workspace settings)
    quietHoursEnabled: { type: Boolean, default: false },
    quietHoursStart: { type: String, default: '22:00' },
    quietHoursEnd: { type: String, default: '08:00' },
    
    // Priority filtering
    minPriorityLevel: {
      type: String,
      enum: ['all', 'low', 'medium', 'high', 'critical'],
      default: 'all'
    },
    
    // Smart notification settings
    groupSimilarNotifications: { type: Boolean, default: true },
    batchingEnabled: { type: Boolean, default: true },
    batchIntervalMinutes: { type: Number, default: 5, min: 1, max: 60 },
    
    // Thread preference
    preferThreadedReplies: { type: Boolean, default: true }
  },

  // Direct message channel ID for sending DMs
  dmChannelId: {
    type: String
  },

  // App Home state
  appHomeState: {
    lastViewedAt: { type: Date },
    activeTab: { type: String, default: 'tasks' },
    filters: {
      showCompleted: { type: Boolean, default: false },
      showOverdue: { type: Boolean, default: true },
      projectFilter: { type: mongoose.Schema.Types.ObjectId, ref: 'Board' }
    }
  },

  // Thread tracking for task-based threading
  taskThreads: [{
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Card',
      index: true
    },
    channelId: {
      type: String,
      required: true
    },
    threadTs: {
      type: String,
      required: true
    },
    lastMessageAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Notification batching queue
  pendingBatch: [{
    notificationType: String,
    title: String,
    message: String,
    entityId: mongoose.Schema.Types.ObjectId,
    entityType: String,
    priority: String,
    createdAt: { type: Date, default: Date.now }
  }],
  lastBatchSentAt: {
    type: Date
  },

  // Interaction tracking
  lastInteractionAt: {
    type: Date
  },
  interactionCount: {
    type: Number,
    default: 0
  },

  // Connection status
  isActive: {
    type: Boolean,
    default: true
  },
  linkedAt: {
    type: Date,
    default: Date.now
  },
  unlinkedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
slackUserSchema.index({ user: 1, workspace: 1 }, { unique: true });
slackUserSchema.index({ slackUserId: 1, workspace: 1 }, { unique: true });
slackUserSchema.index({ 'taskThreads.taskId': 1 });
slackUserSchema.index({ isActive: 1, 'preferences.notificationsEnabled': 1 });

// Method to check if user is in quiet hours
slackUserSchema.methods.isInQuietHours = function() {
  if (!this.preferences.quietHoursEnabled) return false;
  
  const now = new Date();
  const timezone = this.slackTimezone || 'UTC';
  
  // Convert current time to user's timezone
  const userTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const currentMinutes = userTime.getHours() * 60 + userTime.getMinutes();
  
  // Parse quiet hours
  const [startHour, startMin] = this.preferences.quietHoursStart.split(':').map(Number);
  const [endHour, endMin] = this.preferences.quietHoursEnd.split(':').map(Number);
  
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  
  // Handle overnight quiet hours (e.g., 22:00 - 08:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
  
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
};

// Method to check if notification should be sent based on preferences
slackUserSchema.methods.shouldReceiveNotification = function(type, priority) {
  if (!this.preferences.notificationsEnabled) return false;
  if (!this.isActive) return false;
  
  // Check notification type preference
  const typePreferences = {
    'task_assigned': this.preferences.taskAssigned,
    'task_updated': this.preferences.taskUpdated,
    'task_completed': this.preferences.taskCompleted,
    'task_deleted': this.preferences.taskDeleted,
    'task_overdue': this.preferences.taskOverdue,
    'task_due_soon': this.preferences.taskDueSoon,
    'comment_added': this.preferences.commentAdded,
    'comment_mention': this.preferences.commentMention,
    'subtask_updated': this.preferences.subtaskUpdates,
    'project_created': this.preferences.projectUpdates,
    'project_updated': this.preferences.projectUpdates,
    'team_invite': this.preferences.teamUpdates,
    'announcement_created': this.preferences.announcements,
    'reminder_due_soon': this.preferences.reminders,
    'status_change': this.preferences.statusChanges
  };
  
  if (typePreferences[type] === false) return false;
  
  // Check priority filter
  const priorityLevels = ['all', 'low', 'medium', 'high', 'critical'];
  const userMinPriority = priorityLevels.indexOf(this.preferences.minPriorityLevel);
  const notificationPriority = priorityLevels.indexOf(priority || 'medium');
  
  if (this.preferences.minPriorityLevel !== 'all' && notificationPriority < userMinPriority) {
    return false;
  }
  
  return true;
};

// Method to find or create thread for a task
slackUserSchema.methods.getTaskThread = function(taskId) {
  return this.taskThreads.find(t => t.taskId.toString() === taskId.toString());
};

slackUserSchema.methods.setTaskThread = function(taskId, channelId, threadTs) {
  const existingIndex = this.taskThreads.findIndex(
    t => t.taskId.toString() === taskId.toString()
  );
  
  const threadData = {
    taskId,
    channelId,
    threadTs,
    lastMessageAt: new Date()
  };
  
  if (existingIndex >= 0) {
    this.taskThreads[existingIndex] = threadData;
  } else {
    this.taskThreads.push(threadData);
  }
  
  // Keep only last 1000 threads
  if (this.taskThreads.length > 1000) {
    this.taskThreads = this.taskThreads
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
      .slice(0, 1000);
  }
};

// Method to add to pending batch
slackUserSchema.methods.addToBatch = function(notification) {
  this.pendingBatch.push({
    notificationType: notification.type,
    title: notification.title,
    message: notification.message,
    entityId: notification.entityId,
    entityType: notification.entityType,
    priority: notification.priority,
    createdAt: new Date()
  });
  
  // Limit batch size
  if (this.pendingBatch.length > 50) {
    this.pendingBatch = this.pendingBatch.slice(-50);
  }
};

// Method to clear batch
slackUserSchema.methods.clearBatch = function() {
  this.pendingBatch = [];
  this.lastBatchSentAt = new Date();
};

// Static method to find Slack user by FlowTask user ID
slackUserSchema.statics.findByUserId = function(userId, workspaceId = null) {
  const query = { user: userId, isActive: true };
  if (workspaceId) query.workspace = workspaceId;
  return this.findOne(query);
};

// Static method to find Slack user by Slack user ID
slackUserSchema.statics.findBySlackUserId = function(slackUserId, workspaceId) {
  return this.findOne({
    slackUserId,
    workspace: workspaceId,
    isActive: true
  });
};

// Static method to find all users with pending batches
slackUserSchema.statics.findUsersWithPendingBatches = function(maxBatchAge) {
  const cutoffTime = new Date(Date.now() - maxBatchAge);
  return this.find({
    isActive: true,
    'preferences.batchingEnabled': true,
    'pendingBatch.0': { $exists: true },
    $or: [
      { lastBatchSentAt: { $lt: cutoffTime } },
      { lastBatchSentAt: null }
    ]
  });
};

export default mongoose.model('SlackUser', slackUserSchema);
