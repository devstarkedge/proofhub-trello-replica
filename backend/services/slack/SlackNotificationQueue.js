/**
 * Slack Notification Queue System
 * In-memory queue for reliable Slack notification delivery (no Redis required)
 */

import SlackNotification from '../../models/SlackNotification.js';
import SlackUser from '../../models/SlackUser.js';
import SlackWorkspace from '../../models/SlackWorkspace.js';
import SlackAnalytics from '../../models/SlackAnalytics.js';
import SlackApiClient from './SlackApiClient.js';
import SlackBlockKitBuilder from './SlackBlockKitBuilder.js';

// Block Kit builder instance
const blockBuilder = new SlackBlockKitBuilder(process.env.FRONTEND_URL);

// In-memory queues
const queues = {
  notifications: [],
  batches: [],
  digests: [],
  appHome: [],
  analytics: []
};

// Processing flags
const processing = {
  notifications: false,
  batches: false,
  digests: false,
  appHome: false,
  analytics: false
};

// Stats tracking
const stats = {
  notifications: { completed: 0, failed: 0, waiting: 0 },
  batches: { completed: 0, failed: 0, waiting: 0 },
  digests: { completed: 0, failed: 0, waiting: 0 },
  appHome: { completed: 0, failed: 0, waiting: 0 },
  analytics: { completed: 0, failed: 0, waiting: 0 }
};

/**
 * Process a single notification
 */
async function processNotification(job) {
  const startTime = Date.now();
  const { notificationId, workspaceId, priority } = job;

  try {
    // Load notification and workspace
    const notification = await SlackNotification.findById(notificationId);
    if (!notification) {
      throw new Error('Notification not found');
    }

    const workspace = await SlackWorkspace.findById(workspaceId);
    if (!workspace || !workspace.isActive) {
      notification.status = 'suppressed';
      notification.suppressedReason = 'workspace_disabled';
      await notification.save();
      return { success: false, reason: 'workspace_disabled' };
    }

    // Initialize Slack client
    const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);

    // Send the message
    const result = await slackClient.sendMessage(notification.channelId, {
      blocks: notification.blockKitPayload?.blocks,
      text: notification.title,
      thread_ts: notification.threadTs,
      unfurl_links: false,
      unfurl_media: false
    });

    // Update notification status
    const processingTime = Date.now() - startTime;
    notification.markDelivered(result.data.ts, processingTime);
    notification.metadata.processingTimeMs = processingTime;
    notification.metadata.slackApiResponseTime = result.responseTime;
    await notification.save();

    // Record analytics
    await recordAnalytics({
      workspaceId: workspace._id,
      type: notification.type,
      priority: notification.priority,
      processingTimeMs: processingTime,
      deliveryLatencyMs: processingTime,
      status: 'delivered'
    });

    stats.notifications.completed++;
    return { success: true, messageTs: result.data.ts };
  } catch (error) {
    console.error('Notification delivery failed:', error);
    stats.notifications.failed++;

    // Update notification with failure
    if (notificationId) {
      try {
        const notification = await SlackNotification.findById(notificationId);
        if (notification) {
          notification.markFailed(error.message);
          await notification.save();
        }
      } catch (updateError) {
        console.error('Failed to update notification status:', updateError);
      }
    }

    // Record failure analytics
    await recordAnalytics({
      workspaceId,
      status: 'failed',
      errorType: error.name || 'UnknownError'
    });

    throw error;
  }
}

/**
 * Process batch notification
 */
async function processBatch(job) {
  const { slackUserId, workspaceId } = job;

  try {
    const slackUser = await SlackUser.findById(slackUserId).populate('workspace');
    if (!slackUser || !slackUser.isActive) {
      return { success: false, reason: 'user_inactive' };
    }

    if (slackUser.pendingBatch.length === 0) {
      return { success: true, count: 0 };
    }

    const workspace = slackUser.workspace;
    if (!workspace || !workspace.isActive) {
      return { success: false, reason: 'workspace_disabled' };
    }

    // Build batch notification
    const batchPayload = blockBuilder.buildBatchNotification({
      notifications: slackUser.pendingBatch,
      groupedBy: 'type',
      timeRange: `${workspace.settings.batchIntervalMinutes || 5} minutes`
    });

    // Initialize Slack client
    const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);

    // Send batch message
    const channelId = slackUser.dmChannelId || (await slackClient.openDMChannel(slackUser.slackUserId)).data.channel.id;
    
    const result = await slackClient.sendMessage(channelId, {
      blocks: batchPayload.blocks,
      text: batchPayload.text
    });

    // Create notification record for batch
    await SlackNotification.create({
      workspace: workspace._id,
      slackUser: slackUser._id,
      user: slackUser.user,
      type: 'batch_notification',
      title: `${slackUser.pendingBatch.length} Updates`,
      channelId,
      messageTs: result.data.ts,
      blockKitPayload: batchPayload,
      status: 'delivered',
      deliveredAt: new Date(),
      metadata: {
        wasBatched: true,
        batchSize: slackUser.pendingBatch.length
      }
    });

    // Clear the batch
    const batchCount = slackUser.pendingBatch.length;
    slackUser.clearBatch();
    if (!slackUser.dmChannelId) {
      slackUser.dmChannelId = channelId;
    }
    await slackUser.save();

    stats.batches.completed++;
    return { success: true, count: batchCount };
  } catch (error) {
    console.error('Batch notification failed:', error);
    stats.batches.failed++;
    throw error;
  }
}

/**
 * Process digest notification
 */
async function processDigest(job) {
  const { slackUserId, period } = job;

  try {
    const slackUser = await SlackUser.findById(slackUserId)
      .populate('user')
      .populate('workspace');
    
    if (!slackUser || !slackUser.isActive) {
      return { success: false, reason: 'user_inactive' };
    }

    const workspace = slackUser.workspace;
    if (!workspace || !workspace.isActive) {
      return { success: false, reason: 'workspace_disabled' };
    }

    // Import Card model dynamically to avoid circular dependencies
    const Card = (await import('../../models/Card.js')).default;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

    // Get user's tasks
    const [assignedTasks, overdueTasks, dueTodayTasks, recentlyCompleted] = await Promise.all([
      Card.find({
        assignees: slackUser.user._id,
        isArchived: false,
        status: { $ne: 'completed' }
      }).populate('board', 'name').limit(20).lean(),
      
      Card.find({
        assignees: slackUser.user._id,
        isArchived: false,
        status: { $ne: 'completed' },
        dueDate: { $lt: now }
      }).populate('board', 'name').lean(),
      
      Card.find({
        assignees: slackUser.user._id,
        isArchived: false,
        status: { $ne: 'completed' },
        dueDate: { $gte: startOfToday, $lt: endOfToday }
      }).populate('board', 'name').lean(),
      
      Card.find({
        assignees: slackUser.user._id,
        status: 'completed',
        updatedAt: { $gte: new Date(now.getTime() - (period === 'daily' ? 24 : period === 'weekly' ? 168 : 1) * 60 * 60 * 1000) }
      }).lean()
    ]);

    // Calculate overdue days
    overdueTasks.forEach(task => {
      task.overdueDays = Math.ceil((now - new Date(task.dueDate)) / (1000 * 60 * 60 * 24));
    });

    // Build digest
    const digestPayload = blockBuilder.buildDigestNotification({
      period,
      user: slackUser.user,
      stats: {
        completed: recentlyCompleted.length,
        inProgress: assignedTasks.filter(t => t.status === 'in-progress').length,
        dueSoon: dueTodayTasks.length,
        overdue: overdueTasks.length
      },
      overdueTasks,
      dueTodayTasks,
      assignedTasks: assignedTasks.slice(0, 5),
      completedTasks: recentlyCompleted
    });

    // Send digest
    const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
    const channelId = slackUser.dmChannelId || (await slackClient.openDMChannel(slackUser.slackUserId)).data.channel.id;
    
    const result = await slackClient.sendMessage(channelId, {
      blocks: digestPayload.blocks,
      text: digestPayload.text
    });

    // Create notification record
    await SlackNotification.create({
      workspace: workspace._id,
      slackUser: slackUser._id,
      user: slackUser.user._id,
      type: `digest_${period}`,
      title: digestPayload.text,
      channelId,
      messageTs: result.data.ts,
      blockKitPayload: digestPayload,
      status: 'delivered',
      deliveredAt: new Date()
    });

    // Update user's DM channel if not set
    if (!slackUser.dmChannelId) {
      slackUser.dmChannelId = channelId;
      await slackUser.save();
    }

    stats.digests.completed++;
    return { success: true };
  } catch (error) {
    console.error('Digest notification failed:', error);
    stats.digests.failed++;
    throw error;
  }
}

/**
 * Process App Home update
 */
async function processAppHomeUpdate(job) {
  const { slackUserId, workspaceId } = job;

  try {
    const slackUser = await SlackUser.findById(slackUserId)
      .populate('user')
      .populate('workspace');
    
    if (!slackUser || !slackUser.isActive) {
      return { success: false, reason: 'user_inactive' };
    }

    const workspace = slackUser.workspace;
    if (!workspace || !workspace.isActive || !workspace.settings.appHomeEnabled) {
      return { success: false, reason: 'feature_disabled' };
    }

    // Import Card model dynamically
    const Card = (await import('../../models/Card.js')).default;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

    // Get user's tasks
    const [assignedTasks, overdueTasks, dueTodayTasks, recentlyUpdated] = await Promise.all([
      Card.find({
        assignees: slackUser.user._id,
        isArchived: false,
        status: { $ne: 'completed' }
      })
        .populate('board', 'name')
        .sort({ priority: -1, dueDate: 1 })
        .limit(20)
        .lean(),
      
      Card.find({
        assignees: slackUser.user._id,
        isArchived: false,
        status: { $ne: 'completed' },
        dueDate: { $lt: now }
      })
        .populate('board', 'name')
        .sort({ dueDate: 1 })
        .limit(10)
        .lean(),
      
      Card.find({
        assignees: slackUser.user._id,
        isArchived: false,
        status: { $ne: 'completed' },
        dueDate: { $gte: startOfToday, $lt: endOfToday }
      })
        .populate('board', 'name')
        .lean(),
      
      Card.find({
        assignees: slackUser.user._id,
        isArchived: false,
        updatedAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }
      })
        .populate('board', 'name')
        .sort({ updatedAt: -1 })
        .limit(5)
        .lean()
    ]);

    // Calculate overdue days
    overdueTasks.forEach(task => {
      task.overdueDays = Math.ceil((now - new Date(task.dueDate)) / (1000 * 60 * 60 * 24));
    });

    // Calculate stats
    const taskStats = {
      overdue: overdueTasks.length,
      dueToday: dueTodayTasks.length,
      inProgress: assignedTasks.filter(t => t.status === 'in-progress').length,
      completed: assignedTasks.filter(t => t.status === 'completed').length
    };

    // Build App Home view
    console.log('Building App Home view with stats:', taskStats);
    const homeView = blockBuilder.buildAppHome({
      user: slackUser.user,
      assignedTasks,
      dueTodayTasks,
      overdueTasks,
      recentlyUpdated,
      stats: taskStats
    });

    // Validate view structure before sending
    if (!homeView.type || homeView.type !== 'home') {
      throw new Error('Invalid home view: missing type=home');
    }
    if (!Array.isArray(homeView.blocks) || homeView.blocks.length === 0) {
      throw new Error('Invalid home view: blocks must be non-empty array');
    }

    console.log('App Home view blocks count:', homeView.blocks.length);
    console.log('App Home view structure:', JSON.stringify(homeView, null, 2).substring(0, 500) + '...');

    // Publish to Slack
    const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
    try {
      console.log('Publishing App Home for user:', slackUser.slackUserId);
      const publishResult = await slackClient.publishHomeView(slackUser.slackUserId, homeView);
      
      if (publishResult?.success === false && publishResult.error === 'not_enabled') {
        console.warn('App Home feature not enabled for workspace:', workspace.teamId);
        // Continue anyway - test notification was sent successfully
      } else if (publishResult?.success) {
        console.log('✅ App Home published successfully');
      }
    } catch (error) {
      // Handle not_enabled error gracefully (App Home feature not enabled in Slack app)
      if (error.data?.error === 'not_enabled') {
        console.warn('App Home feature not enabled for workspace:', workspace.teamId);
        // Continue anyway - test notification was sent successfully
      } else if (error.data?.error === 'invalid_arguments') {
        console.error('❌ invalid_arguments error - view structure is invalid');
        console.error('Error details:', error.data);
        console.error('Response messages:', error.data?.response_metadata?.messages);
        throw error;
      } else {
        throw error;
      }
    }

    // Update last viewed
    slackUser.appHomeState.lastViewedAt = new Date();
    await slackUser.save();

    stats.appHome.completed++;
    return { success: true };
  } catch (error) {
    console.error('App Home update failed:', error);
    stats.appHome.failed++;
    // Don't throw - allow notification to succeed even if App Home update fails
    return { success: false, reason: error.message };
  }
}

/**
 * Record analytics (direct database update, no queue)
 */
async function recordAnalytics(data) {
  const { workspaceId, type, priority, processingTimeMs, deliveryLatencyMs, status, errorType } = data;

  try {
    const now = new Date();
    const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Update hourly analytics
    await SlackAnalytics.findOneAndUpdate(
      {
        workspace: workspaceId,
        period: 'hourly',
        periodStart: hourStart
      },
      {
        $inc: {
          'deliveryMetrics.totalSent': 1,
          [`deliveryMetrics.total${status === 'delivered' ? 'Delivered' : 'Failed'}`]: 1,
          ...(errorType ? { 'errorMetrics.totalErrors': 1 } : {})
        },
        $set: {
          periodEnd: new Date(hourStart.getTime() + 60 * 60 * 1000)
        }
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    // Update daily analytics
    await SlackAnalytics.findOneAndUpdate(
      {
        workspace: workspaceId,
        period: 'daily',
        periodStart: dayStart
      },
      {
        $inc: {
          'deliveryMetrics.totalSent': 1,
          [`deliveryMetrics.total${status === 'delivered' ? 'Delivered' : 'Failed'}`]: 1
        },
        $set: {
          periodEnd: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
        }
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    stats.analytics.completed++;
    return { success: true };
  } catch (error) {
    console.error('Analytics recording failed:', error);
    stats.analytics.failed++;
    // Don't throw - analytics failures shouldn't break the flow
    return { success: false, error: error.message };
  }
}

/**
 * Process queue with concurrency control
 */
async function processQueue(queueName, processor, concurrency = 5) {
  if (processing[queueName]) return;
  if (queues[queueName].length === 0) return;

  processing[queueName] = true;

  try {
    // Process jobs in batches
    while (queues[queueName].length > 0) {
      const batch = queues[queueName].splice(0, concurrency);
      stats[queueName].waiting = queues[queueName].length;

      await Promise.allSettled(
        batch.map(job => processor(job).catch(err => {
          console.error(`${queueName} job failed:`, err.message);
        }))
      );
    }
  } finally {
    processing[queueName] = false;
  }
}

/**
 * Add notification to queue
 */
async function queueNotification(notificationData) {
  const {
    workspace,
    slackUser,
    user,
    type,
    title,
    message,
    channelId,
    threadTs,
    blockKitPayload,
    entityId,
    entityType,
    relatedBoard,
    sender,
    priority = 'medium'
  } = notificationData;

  // Create notification record
  const notification = await SlackNotification.create({
    workspace: workspace._id || workspace,
    slackUser: slackUser?._id || slackUser,
    user: user?._id || user,
    type,
    title,
    message,
    channelId,
    threadTs,
    isThreaded: !!threadTs,
    blockKitPayload,
    entityId,
    entityType,
    relatedBoard,
    sender: sender?._id || sender,
    priority,
    status: 'queued'
  });

  // Add to queue with priority sorting
  const priorityWeights = { critical: 1, high: 2, medium: 3, low: 4 };
  const job = {
    notificationId: notification._id,
    workspaceId: workspace._id || workspace,
    priority,
    weight: priorityWeights[priority] || 3,
    addedAt: Date.now()
  };

  // Insert in priority order
  const insertIndex = queues.notifications.findIndex(j => j.weight > job.weight);
  if (insertIndex === -1) {
    queues.notifications.push(job);
  } else {
    queues.notifications.splice(insertIndex, 0, job);
  }

  stats.notifications.waiting = queues.notifications.length;

  // Process immediately for critical priority, otherwise debounce
  if (priority === 'critical') {
    setImmediate(() => processQueue('notifications', processNotification, 10));
  } else {
    // Debounce processing
    setTimeout(() => processQueue('notifications', processNotification, 10), 100);
  }

  return notification;
}

/**
 * Add batch processing job
 */
async function queueBatchProcess(slackUserId, workspaceId) {
  // Check if already queued
  const existing = queues.batches.find(j => j.slackUserId.toString() === slackUserId.toString());
  if (existing) return;

  queues.batches.push({
    slackUserId,
    workspaceId,
    addedAt: Date.now()
  });

  stats.batches.waiting = queues.batches.length;

  // Process with delay to allow batching
  setTimeout(() => processQueue('batches', processBatch, 5), 1000);
}

/**
 * Add digest job
 */
async function queueDigest(slackUserId, period) {
  queues.digests.push({
    slackUserId,
    period,
    addedAt: Date.now()
  });

  stats.digests.waiting = queues.digests.length;

  // Process immediately
  setImmediate(() => processQueue('digests', processDigest, 5));
}

/**
 * Add App Home update job (with deduplication)
 */
async function queueAppHomeUpdate(slackUserId, workspaceId) {
  // Remove any existing job for this user (debounce)
  queues.appHome = queues.appHome.filter(
    j => j.slackUserId.toString() !== slackUserId.toString()
  );

  queues.appHome.push({
    slackUserId,
    workspaceId,
    addedAt: Date.now()
  });

  stats.appHome.waiting = queues.appHome.length;

  // Process with debounce delay
  setTimeout(() => processQueue('appHome', processAppHomeUpdate, 10), 500);
}

/**
 * Process pending batches (called by scheduler)
 */
async function processPendingBatches() {
  try {
    const users = await SlackUser.findUsersWithPendingBatches(5 * 60 * 1000); // 5 minutes
    
    for (const user of users) {
      await queueBatchProcess(user._id, user.workspace);
    }
    
    return { processed: users.length };
  } catch (error) {
    console.error('Error processing pending batches:', error);
    throw error;
  }
}

/**
 * Process scheduled digests (called by scheduler)
 */
async function processScheduledDigests(period) {
  try {
    const now = new Date();
    const currentHour = now.getHours().toString().padStart(2, '0') + ':00';
    const currentDay = now.getDay(); // 0 = Sunday

    const query = {
      isActive: true,
      'preferences.digestEnabled': true,
      'preferences.digestFrequency': period
    };

    // For daily digests, check the time
    if (period === 'daily') {
      query['preferences.digestTime'] = currentHour;
    }

    // For weekly digests, check if it's the right day (Monday = 1)
    if (period === 'weekly' && currentDay !== 1) {
      return { processed: 0 };
    }

    const users = await SlackUser.find(query);
    
    for (const user of users) {
      await queueDigest(user._id, period);
    }
    
    return { processed: users.length };
  } catch (error) {
    console.error('Error processing scheduled digests:', error);
    throw error;
  }
}

/**
 * Get queue stats
 */
async function getQueueStats() {
  return {
    notifications: {
      waiting: queues.notifications.length,
      completed: stats.notifications.completed,
      failed: stats.notifications.failed
    },
    batches: {
      waiting: queues.batches.length,
      completed: stats.batches.completed,
      failed: stats.batches.failed
    },
    digests: {
      waiting: queues.digests.length,
      completed: stats.digests.completed,
      failed: stats.digests.failed
    },
    appHome: {
      waiting: queues.appHome.length,
      completed: stats.appHome.completed,
      failed: stats.appHome.failed
    }
  };
}

/**
 * Clean up (no-op for in-memory queue, but keep for API compatibility)
 */
async function cleanupQueues() {
  // In-memory queues don't need cleanup
  return { success: true };
}

/**
 * Graceful shutdown - process remaining jobs
 */
async function shutdown() {
  console.log('Shutting down notification queues...');
  
  // Process remaining jobs
  await Promise.all([
    processQueue('notifications', processNotification, 10),
    processQueue('batches', processBatch, 5),
    processQueue('digests', processDigest, 5),
    processQueue('appHome', processAppHomeUpdate, 10)
  ]);

  console.log('Notification queues shut down');
}

// Placeholder exports for API compatibility (no longer used)
const notificationQueue = { on: () => {}, process: () => {} };
const batchQueue = { on: () => {}, process: () => {} };
const digestQueue = { on: () => {}, process: () => {} };
const appHomeQueue = { on: () => {}, process: () => {} };
const analyticsQueue = { on: () => {}, process: () => {} };

export {
  notificationQueue,
  batchQueue,
  digestQueue,
  appHomeQueue,
  analyticsQueue,
  queueNotification,
  queueBatchProcess,
  queueDigest,
  queueAppHomeUpdate,
  processPendingBatches,
  processScheduledDigests,
  getQueueStats,
  cleanupQueues,
  shutdown
};
