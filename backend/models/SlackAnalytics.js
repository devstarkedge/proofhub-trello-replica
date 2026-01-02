import mongoose from 'mongoose';

const slackAnalyticsSchema = new mongoose.Schema({
  // Workspace reference
  workspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SlackWorkspace',
    required: true,
    index: true
  },

  // Time period
  period: {
    type: String,
    enum: ['hourly', 'daily', 'weekly', 'monthly'],
    required: true,
    index: true
  },
  periodStart: {
    type: Date,
    required: true,
    index: true
  },
  periodEnd: {
    type: Date,
    required: true
  },

  // Delivery metrics
  deliveryMetrics: {
    totalSent: { type: Number, default: 0 },
    totalDelivered: { type: Number, default: 0 },
    totalFailed: { type: Number, default: 0 },
    totalSuppressed: { type: Number, default: 0 },
    totalBatched: { type: Number, default: 0 },
    totalRateLimited: { type: Number, default: 0 },
    
    // Delivery rate
    deliveryRate: { type: Number, default: 0 }, // percentage
    
    // Latency stats
    avgDeliveryLatencyMs: { type: Number, default: 0 },
    p50DeliveryLatencyMs: { type: Number, default: 0 },
    p95DeliveryLatencyMs: { type: Number, default: 0 },
    p99DeliveryLatencyMs: { type: Number, default: 0 },
    
    // Processing stats
    avgProcessingTimeMs: { type: Number, default: 0 }
  },

  // Notification type breakdown
  byType: [{
    type: { type: String },
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    interactions: { type: Number, default: 0 }
  }],

  // Priority breakdown
  byPriority: {
    critical: { sent: Number, delivered: Number, interactions: Number },
    high: { sent: Number, delivered: Number, interactions: Number },
    medium: { sent: Number, delivered: Number, interactions: Number },
    low: { sent: Number, delivered: Number, interactions: Number }
  },

  // Interaction metrics
  interactionMetrics: {
    totalInteractions: { type: Number, default: 0 },
    interactionRate: { type: Number, default: 0 }, // percentage
    
    // By action type
    byActionType: [{
      actionType: String,
      count: { type: Number, default: 0 }
    }],
    
    // Most used actions
    topActions: [{
      actionId: String,
      count: { type: Number, default: 0 }
    }],
    
    // Average response time (user interaction time)
    avgResponseTimeMs: { type: Number, default: 0 }
  },

  // User engagement
  userEngagement: {
    uniqueUsersNotified: { type: Number, default: 0 },
    uniqueUsersInteracted: { type: Number, default: 0 },
    engagementRate: { type: Number, default: 0 },
    
    // Active users
    activeUsers: { type: Number, default: 0 },
    
    // Users with preferences changed
    usersWithCustomPreferences: { type: Number, default: 0 }
  },

  // Feature usage
  featureUsage: {
    // Slash commands
    slashCommands: {
      total: { type: Number, default: 0 },
      byCommand: [{
        command: String,
        count: { type: Number, default: 0 }
      }]
    },
    
    // App Home
    appHomeViews: { type: Number, default: 0 },
    appHomeInteractions: { type: Number, default: 0 },
    
    // Threading
    threadedNotifications: { type: Number, default: 0 },
    threadReplies: { type: Number, default: 0 },
    
    // Batching
    batchesSent: { type: Number, default: 0 },
    notificationsBatched: { type: Number, default: 0 },
    
    // Digests
    digestsSent: { type: Number, default: 0 },
    digestsOpened: { type: Number, default: 0 }
  },

  // Error tracking
  errorMetrics: {
    totalErrors: { type: Number, default: 0 },
    byErrorType: [{
      errorType: String,
      count: { type: Number, default: 0 },
      lastOccurrence: Date
    }],
    
    // Retry stats
    totalRetries: { type: Number, default: 0 },
    successfulRetries: { type: Number, default: 0 },
    failedAfterRetries: { type: Number, default: 0 }
  },

  // Channel metrics
  channelMetrics: [{
    channelId: String,
    channelName: String,
    notificationsSent: { type: Number, default: 0 },
    interactions: { type: Number, default: 0 }
  }],

  // Suppression reasons
  suppressionReasons: {
    quietHours: { type: Number, default: 0 },
    userPreference: { type: Number, default: 0 },
    rateLimit: { type: Number, default: 0 },
    duplicate: { type: Number, default: 0 },
    lowPriority: { type: Number, default: 0 }
  },

  // Role-based routing stats
  roleBasedStats: {
    adminNotifications: { type: Number, default: 0 },
    managerNotifications: { type: Number, default: 0 },
    memberNotifications: { type: Number, default: 0 }
  },

  // System health during period
  systemHealth: {
    avgQueueLength: { type: Number, default: 0 },
    maxQueueLength: { type: Number, default: 0 },
    avgWorkerUtilization: { type: Number, default: 0 },
    rateLimitHits: { type: Number, default: 0 },
    apiErrors: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
slackAnalyticsSchema.index({ workspace: 1, period: 1, periodStart: -1 });
slackAnalyticsSchema.index({ periodStart: 1, periodEnd: 1 });

// Static method to create or update analytics record
slackAnalyticsSchema.statics.upsertAnalytics = async function(workspaceId, period, periodStart, data) {
  return this.findOneAndUpdate(
    {
      workspace: workspaceId,
      period,
      periodStart
    },
    {
      $set: {
        periodEnd: data.periodEnd,
        ...data
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  );
};

// Static method to get analytics summary
slackAnalyticsSchema.statics.getSummary = async function(workspaceId, period, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        workspace: new mongoose.Types.ObjectId(workspaceId),
        period,
        periodStart: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        totalSent: { $sum: '$deliveryMetrics.totalSent' },
        totalDelivered: { $sum: '$deliveryMetrics.totalDelivered' },
        totalFailed: { $sum: '$deliveryMetrics.totalFailed' },
        totalInteractions: { $sum: '$interactionMetrics.totalInteractions' },
        avgDeliveryLatency: { $avg: '$deliveryMetrics.avgDeliveryLatencyMs' },
        uniqueUsersNotified: { $sum: '$userEngagement.uniqueUsersNotified' },
        totalSlashCommands: { $sum: '$featureUsage.slashCommands.total' },
        totalAppHomeViews: { $sum: '$featureUsage.appHomeViews' }
      }
    }
  ]);
};

// Static method to get trend data
slackAnalyticsSchema.statics.getTrends = async function(workspaceId, period, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.find({
    workspace: workspaceId,
    period,
    periodStart: { $gte: startDate }
  })
    .sort({ periodStart: 1 })
    .select('periodStart deliveryMetrics.totalSent deliveryMetrics.totalDelivered deliveryMetrics.deliveryRate interactionMetrics.interactionRate')
    .lean();
};

// Static method to get top performing notification types
slackAnalyticsSchema.statics.getTopNotificationTypes = async function(workspaceId, period, limit = 10) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        workspace: new mongoose.Types.ObjectId(workspaceId),
        period,
        periodStart: { $gte: thirtyDaysAgo }
      }
    },
    { $unwind: '$byType' },
    {
      $group: {
        _id: '$byType.type',
        totalSent: { $sum: '$byType.sent' },
        totalDelivered: { $sum: '$byType.delivered' },
        totalInteractions: { $sum: '$byType.interactions' }
      }
    },
    {
      $addFields: {
        deliveryRate: {
          $cond: [
            { $gt: ['$totalSent', 0] },
            { $multiply: [{ $divide: ['$totalDelivered', '$totalSent'] }, 100] },
            0
          ]
        },
        interactionRate: {
          $cond: [
            { $gt: ['$totalDelivered', 0] },
            { $multiply: [{ $divide: ['$totalInteractions', '$totalDelivered'] }, 100] },
            0
          ]
        }
      }
    },
    { $sort: { totalSent: -1 } },
    { $limit: limit }
  ]);
};

export default mongoose.model('SlackAnalytics', slackAnalyticsSchema);
