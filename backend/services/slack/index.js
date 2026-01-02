/**
 * Slack Services Index
 * Central export point for all Slack integration services
 */

// Core Services
export { default as SlackApiClient, RateLimitError, AuthenticationError, ChannelError, UserError } from './SlackApiClient.js';
export { default as SlackBlockKitBuilder, PRIORITY_COLORS, STATUS_COLORS, PRIORITY_EMOJI, STATUS_EMOJI, NOTIFICATION_EMOJI } from './SlackBlockKitBuilder.js';
export { default as slackNotificationService, SlackNotificationService } from './SlackNotificationService.js';

// Handlers
export { default as slackInteractiveHandler, SlackInteractiveHandler } from './SlackInteractiveHandler.js';
export { default as slackSlashCommandHandler, SlackSlashCommandHandler } from './SlackSlashCommandHandler.js';
export { default as slackOAuthHandler, SlackOAuthHandler } from './SlackOAuthHandler.js';
export { default as slackAppHomeService, SlackAppHomeService } from './SlackAppHomeService.js';

// Queue System
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
  shutdown as shutdownQueues
} from './SlackNotificationQueue.js';

/**
 * Initialize all Slack services
 */
export async function initializeSlackServices() {
  console.log('Initializing Slack integration services...');
  
  // Verify required environment variables
  const requiredEnvVars = [
    'SLACK_CLIENT_ID',
    'SLACK_CLIENT_SECRET',
    'SLACK_SIGNING_SECRET'
  ];
  
  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  if (missingVars.length > 0) {
    console.warn('⚠️ Missing Slack environment variables:', missingVars.join(', '));
    console.warn('Slack integration will be disabled until these are configured.');
    return false;
  }
  
  console.log('✅ Slack integration services initialized');
  return true;
}

/**
 * Graceful shutdown of all Slack services
 */
export async function shutdownSlackServices() {
  console.log('Shutting down Slack integration services...');
  
  try {
    const { shutdown } = await import('./SlackNotificationQueue.js');
    await shutdown();
    console.log('✅ Slack queues shut down successfully');
  } catch (error) {
    console.error('Error shutting down Slack services:', error);
  }
}

/**
 * Health check for Slack services
 */
export async function slackHealthCheck() {
  const { getQueueStats } = await import('./SlackNotificationQueue.js');
  const SlackWorkspace = (await import('../../models/SlackWorkspace.js')).default;
  const mongoose = (await import('mongoose')).default;
  
  let apiConnected = false;
  let queueHealthy = true;
  let dbConnected = false;
  let rateLimitOk = true;
  
  try {
    // Check database connection
    dbConnected = mongoose.connection.readyState === 1;
    
    // Get queue stats
    let queueStats = null;
    try {
      queueStats = await getQueueStats();
      // In-memory queue is always healthy if it returns stats
      queueHealthy = queueStats !== null;
    } catch (e) {
      queueHealthy = false;
    }
    
    // Get workspace stats
    let workspaceStats = [];
    try {
      workspaceStats = await SlackWorkspace.aggregate([
        {
          $group: {
            _id: '$healthStatus',
            count: { $sum: 1 }
          }
        }
      ]);
    } catch (e) {
      // Database aggregation failed
    }
    
    const workspaceHealth = workspaceStats.reduce((acc, s) => {
      acc[s._id] = s.count;
      return acc;
    }, {});
    
    // Check if any workspace has healthy API connection
    const healthyWorkspaces = await SlackWorkspace.countDocuments({
      isActive: true,
      healthStatus: 'healthy'
    });
    apiConnected = healthyWorkspaces > 0;
    
    // Check rate limit status from workspaces
    const rateLimitedWorkspaces = await SlackWorkspace.countDocuments({
      isActive: true,
      healthStatus: 'rate_limited'
    });
    rateLimitOk = rateLimitedWorkspaces === 0;
    
    return {
      status: 'ok',
      apiConnected,
      queueHealthy,
      dbConnected,
      rateLimitOk,
      queues: queueStats,
      workspaces: workspaceHealth,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'error',
      apiConnected: false,
      queueHealthy: false,
      dbConnected: mongoose.connection.readyState === 1,
      rateLimitOk: true,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}
