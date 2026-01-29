import mongoose from 'mongoose';

const slackNotificationSchema = new mongoose.Schema({
  // Reference to workspace
  workspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SlackWorkspace',
    required: true,
    index: true
  },

  // Reference to Slack user (recipient)
  slackUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SlackUser',
    index: true
  },

  // Reference to FlowTask user
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },

  // Notification details
  type: {
    type: String,
    enum: [
      'task_assigned', 'task_updated', 'task_due_soon', 'task_overdue',
      'task_created', 'task_deleted', 'task_moved', 'task_completed',
      'task_status_changed', 'task_priority_changed',
      'subtask_created', 'subtask_completed', 'subtask_updated',
      'project_created', 'project_updated', 'project_deleted',
      'comment_added', 'comment_mention', 'comment_reply',
      'team_invite', 'team_update',
      'user_registered', 'user_assigned', 'user_unassigned',
      'announcement_created',
      'module_access',
      'reminder_due_soon', 'reminder_sent',
      'deadline_approaching', 'status_change',
      'digest_daily', 'digest_weekly', 'digest_hourly',
      'batch_notification',
      'app_home_update', 'interactive_action',
      'slash_command_response'
    ],
    required: true,
    index: true
  },

  // Priority level
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
    index: true
  },

  // Content
  title: {
    type: String,
    required: true
  },
  message: {
    type: String
  },

  // Slack message details
  channelId: {
    type: String,
    required: true
  },
  channelName: {
    type: String
  },
  messageTs: {
    type: String
  },
  threadTs: {
    type: String
  },
  isThreaded: {
    type: Boolean,
    default: false
  },

  // Block Kit payload (stored for retry/debugging)
  blockKitPayload: {
    type: mongoose.Schema.Types.Mixed
  },

  // Entity references
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'entityType',
    index: true
  },
  entityType: {
    type: String,
    enum: ['Card', 'Board', 'Comment', 'User', 'Announcement', 'Reminder', 'Team', 'Department', 'Subtask', 'SubtaskNano']
  },

  // Related project/board
  relatedBoard: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board'
  },

  // Sender info
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  senderSlackId: {
    type: String
  },

  // Delivery status
  status: {
    type: String,
    enum: ['pending', 'queued', 'sent', 'delivered', 'failed', 'batched', 'suppressed', 'rate_limited'],
    default: 'pending',
    index: true
  },
  deliveredAt: {
    type: Date
  },
  failedAt: {
    type: Date
  },
  failureReason: {
    type: String
  },
  retryCount: {
    type: Number,
    default: 0
  },
  maxRetries: {
    type: Number,
    default: 3
  },
  nextRetryAt: {
    type: Date
  },

  // Rate limiting tracking
  rateLimitedAt: {
    type: Date
  },
  rateLimitRetryAfter: {
    type: Number
  },

  // Interaction tracking
  hasInteraction: {
    type: Boolean,
    default: false
  },
  interactions: [{
    actionId: String,
    actionType: String,
    actionValue: String,
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    performedBySlackId: String,
    performedAt: { type: Date, default: Date.now },
    responseStatus: String
  }],

  // Analytics metadata
  metadata: {
    batchId: String,
    digestId: String,
    queueJobId: String,
    processingTimeMs: Number,
    deliveryLatencyMs: Number,
    slackApiResponseTime: Number,
    userTimezone: String,
    wasInQuietHours: Boolean,
    wasBatched: Boolean,
    batchSize: Number,
    roleBasedRouting: String
  },

  // Suppression tracking
  suppressedReason: {
    type: String,
    enum: ['quiet_hours', 'user_preference', 'rate_limit', 'duplicate', 'low_priority', 'workspace_disabled']
  },

  // TTL for automatic cleanup (30 days for delivered, 7 days for failed)
  expiresAt: {
    type: Date,
    index: { expires: 0 }
  }
}, {
  timestamps: true
});

// Compound indexes for analytics and queries
slackNotificationSchema.index({ workspace: 1, status: 1, createdAt: -1 });
slackNotificationSchema.index({ user: 1, status: 1, createdAt: -1 });
slackNotificationSchema.index({ type: 1, createdAt: -1 });
slackNotificationSchema.index({ status: 1, nextRetryAt: 1 });
slackNotificationSchema.index({ entityId: 1, entityType: 1 });
slackNotificationSchema.index({ createdAt: -1 });
slackNotificationSchema.index({ 'metadata.batchId': 1 });
slackNotificationSchema.index({ hasInteraction: 1, createdAt: -1 });

// Pre-save hook to set expiration
slackNotificationSchema.pre('save', function(next) {
  if (!this.expiresAt) {
    const days = this.status === 'delivered' ? 30 : 
                 this.status === 'failed' ? 7 : 90;
    this.expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
  next();
});

// Method to mark as delivered
slackNotificationSchema.methods.markDelivered = function(messageTs, deliveryLatencyMs) {
  this.status = 'delivered';
  this.deliveredAt = new Date();
  this.messageTs = messageTs;
  if (deliveryLatencyMs) {
    this.metadata.deliveryLatencyMs = deliveryLatencyMs;
  }
  this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
};

// Method to mark as failed
slackNotificationSchema.methods.markFailed = function(reason) {
  this.status = 'failed';
  this.failedAt = new Date();
  this.failureReason = reason;
  this.retryCount += 1;
  
  // Exponential backoff for retries
  if (this.retryCount < this.maxRetries) {
    const backoffMs = Math.min(1000 * Math.pow(2, this.retryCount), 60000);
    this.nextRetryAt = new Date(Date.now() + backoffMs);
    this.status = 'pending';
  }
  
  this.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
};

// Method to record interaction
slackNotificationSchema.methods.recordInteraction = function(interactionData) {
  this.hasInteraction = true;
  this.interactions.push({
    actionId: interactionData.actionId,
    actionType: interactionData.actionType,
    actionValue: interactionData.value,
    performedBy: interactionData.userId,
    performedBySlackId: interactionData.slackUserId,
    performedAt: new Date(),
    responseStatus: interactionData.responseStatus
  });
};

// Static method to get pending retries
slackNotificationSchema.statics.getPendingRetries = function(limit = 100) {
  return this.find({
    status: 'pending',
    retryCount: { $gt: 0, $lt: 3 },
    nextRetryAt: { $lte: new Date() }
  })
    .sort({ nextRetryAt: 1 })
    .limit(limit);
};

// Static method for analytics aggregation
slackNotificationSchema.statics.getAnalytics = async function(workspaceId, startDate, endDate) {
  const matchStage = {
    workspace: new mongoose.Types.ObjectId(workspaceId),
    createdAt: { $gte: startDate, $lte: endDate }
  };

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          status: '$status',
          type: '$type',
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
        },
        count: { $sum: 1 },
        avgDeliveryLatency: { $avg: '$metadata.deliveryLatencyMs' },
        interactionCount: {
          $sum: { $cond: ['$hasInteraction', 1, 0] }
        }
      }
    },
    {
      $group: {
        _id: '$_id.date',
        statuses: {
          $push: {
            status: '$_id.status',
            type: '$_id.type',
            count: '$count',
            avgDeliveryLatency: '$avgDeliveryLatency',
            interactionCount: '$interactionCount'
          }
        },
        totalCount: { $sum: '$count' },
        totalInteractions: { $sum: '$interactionCount' }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

// Static method to get delivery stats
slackNotificationSchema.statics.getDeliveryStats = async function(workspaceId, hours = 24) {
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        workspace: new mongoose.Types.ObjectId(workspaceId),
        createdAt: { $gte: startTime }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgProcessingTime: { $avg: '$metadata.processingTimeMs' },
        avgDeliveryLatency: { $avg: '$metadata.deliveryLatencyMs' }
      }
    }
  ]);
};

export default mongoose.model('SlackNotification', slackNotificationSchema);
