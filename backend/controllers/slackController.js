/**
 * Slack Controller
 * Handles all Slack-related API endpoints
 */

import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import SlackWorkspace from '../models/SlackWorkspace.js';
import SlackUser from '../models/SlackUser.js';
import SlackNotification from '../models/SlackNotification.js';
import mongoose from 'mongoose';
import {
  slackOAuthHandler,
  slackInteractiveHandler,
  slackSlashCommandHandler,
  slackAppHomeService,
  slackNotificationService,
  getQueueStats,
  slackHealthCheck
} from '../services/slack/index.js';

// ==================== OAuth Endpoints ====================

/**
 * @desc    Get Slack OAuth URL
 * @route   GET /api/slack/oauth/url
 * @access  Private
 */
export const getOAuthUrl = asyncHandler(async (req, res) => {
  const { url, state } = slackOAuthHandler.generateAuthUrl(req.user._id.toString());
  
  res.json({
    success: true,
    data: {
      url,
      state
    }
  });
});

/**
 * @desc    Handle OAuth callback
 * @route   GET /api/slack/oauth/callback
 * @access  Public (Slack redirect)
 */
export const handleOAuthCallback = asyncHandler(async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error('Slack OAuth error:', error);
    return res.redirect(`${process.env.FRONTEND_URL}/settings?error=${error}`);
  }

  if (!code || !state) {
    return res.redirect(`${process.env.FRONTEND_URL}/settings?error=missing_params`);
  }

  try {
    const result = await slackOAuthHandler.handleCallback(code, state);
    
    res.redirect(`${process.env.FRONTEND_URL}/settings?success=true&team=${result.teamName}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/settings?error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * @desc    Get user's Slack connection status
 * @route   GET /api/slack/connection
 * @access  Private
 */
export const getConnectionStatus = asyncHandler(async (req, res) => {
  const slackUser = await SlackUser.findOne({
    user: req.user._id,
    isActive: true
  }).populate('workspace', 'teamName teamId isActive healthStatus');

  if (!slackUser) {
    return res.json({
      success: true,
      data: {
        connected: false,
        workspace: null
      }
    });
  }

  res.json({
    success: true,
    data: {
      connected: true,
      workspace: {
        teamName: slackUser.workspace.teamName,
        teamId: slackUser.workspace.teamId,
        isActive: slackUser.workspace.isActive,
        healthStatus: slackUser.workspace.healthStatus
      },
      slackUser: {
        slackUserId: slackUser.slackUserId,
        slackUsername: slackUser.slackUsername,
        slackDisplayName: slackUser.slackDisplayName,
        linkedAt: slackUser.linkedAt
      },
      preferences: slackUser.preferences
    }
  });
});

/**
 * @desc    Disconnect Slack account
 * @route   DELETE /api/slack/connection
 * @access  Private
 */
export const disconnectSlack = asyncHandler(async (req, res) => {
  const slackUser = await SlackUser.findOne({
    user: req.user._id,
    isActive: true
  });

  if (!slackUser) {
    throw new ErrorResponse('Slack account not connected', 404);
  }

  slackUser.isActive = false;
  slackUser.unlinkedAt = new Date();
  await slackUser.save();

  res.json({
    success: true,
    message: 'Slack account disconnected successfully'
  });
});

/**
 * @desc    Update Slack notification preferences
 * @route   PUT /api/slack/preferences
 * @access  Private
 */
export const updatePreferences = asyncHandler(async (req, res) => {
  const slackUser = await SlackUser.findOne({
    user: req.user._id,
    isActive: true
  });

  if (!slackUser) {
    throw new ErrorResponse('Slack account not connected', 404);
  }

  const allowedPreferences = [
    'notificationsEnabled', 'directMessageEnabled',
    'taskAssigned', 'taskUpdated', 'taskCompleted', 'taskDeleted',
    'taskOverdue', 'taskDueSoon', 'commentAdded', 'commentMention',
    'subtaskUpdates', 'projectUpdates', 'teamUpdates', 'announcements',
    'reminders', 'statusChanges',
    'digestEnabled', 'digestFrequency', 'digestTime',
    'quietHoursEnabled', 'quietHoursStart', 'quietHoursEnd',
    'minPriorityLevel', 'groupSimilarNotifications',
    'batchingEnabled', 'batchIntervalMinutes', 'preferThreadedReplies'
  ];

  const updates = {};
  for (const key of allowedPreferences) {
    if (req.body[key] !== undefined) {
      updates[`preferences.${key}`] = req.body[key];
    }
  }

  await SlackUser.findByIdAndUpdate(slackUser._id, { $set: updates });

  res.json({
    success: true,
    message: 'Preferences updated successfully'
  });
});

// ==================== Event Handlers ====================

/**
 * @desc    Handle Slack events (webhook)
 * @route   POST /api/slack/events
 * @access  Public (Slack webhook)
 */
export const handleEvents = asyncHandler(async (req, res) => {
  const payload = req.body;

  console.log('📥 Slack event received:', payload.type, payload.event?.type || '');

  // Handle URL verification challenge
  if (payload.type === 'url_verification') {
    console.log('✅ URL verification challenge received');
    return res.json({ challenge: payload.challenge });
  }

  // Handle events
  if (payload.type === 'event_callback') {
    const event = payload.event;
    console.log('📨 Processing event:', event.type, 'from user:', event.user);

    // Process asynchronously to respond quickly
    setImmediate(async () => {
      try {
        switch (event.type) {
          case 'app_home_opened':
            console.log('🏠 app_home_opened event - processing...');
            await slackAppHomeService.handleAppHomeOpened(payload);
            console.log('🏠 app_home_opened event - done');
            break;
          
          case 'app_uninstalled':
            await slackOAuthHandler.revokeAccess(payload.team_id);
            break;
          
          case 'tokens_revoked':
            // Handle token revocation
            console.log('Tokens revoked for team:', payload.team_id);
            break;
          
          case 'message':
            // Could handle DM messages here for conversational features
            break;
          
          default:
            console.log('Unhandled event type:', event.type);
        }
      } catch (error) {
        console.error('Event handler error:', error);
      }
    });
  }

  // Always respond quickly
  res.json({ ok: true });
});

/**
 * @desc    Handle Slack interactive components
 * @route   POST /api/slack/interactive
 * @access  Public (Slack webhook)
 */
export const handleInteractive = asyncHandler(async (req, res) => {
  // Slack sends payload as form-encoded
  const payload = JSON.parse(req.body.payload);

  let result;

  switch (payload.type) {
    case 'block_actions':
      result = await slackInteractiveHandler.handleBlockAction(payload);
      break;
    
    case 'view_submission':
      result = await slackInteractiveHandler.handleViewSubmission(payload);
      // View submissions need special response format
      if (result.response_action) {
        return res.json(result);
      }
      break;
    
    case 'view_closed':
      result = await slackInteractiveHandler.handleViewClosed(payload);
      break;
    
    case 'shortcut':
    case 'message_action':
      // Handle shortcuts/message actions - these need to open modals
      result = await slackInteractiveHandler.handleShortcut(payload);
      break;
    
    default:
      console.log('Unhandled interactive type:', payload.type);
      result = { ok: true };
  }

  res.json(result || { ok: true });
});

/**
 * @desc    Handle Slack slash commands
 * @route   POST /api/slack/commands
 * @access  Public (Slack webhook)
 */
export const handleCommands = asyncHandler(async (req, res) => {
  // Respond immediately to prevent timeout
  res.json({ response_type: 'ephemeral', text: 'Processing...' });

  // Process command asynchronously
  setImmediate(async () => {
    try {
      const result = await slackSlashCommandHandler.handleCommand(req.body);
      
      // Send actual response via response_url
      if (req.body.response_url) {
        await fetch(req.body.response_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result)
        });
      }
    } catch (error) {
      console.error('Slash command error:', error);
      
      if (req.body.response_url) {
        await fetch(req.body.response_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            response_type: 'ephemeral',
            text: '❌ Something went wrong. Please try again.'
          })
        });
      }
    }
  });
});

/**
 * @desc    Handle Slack options load (for external selects)
 * @route   POST /api/slack/options
 * @access  Public (Slack webhook)
 */
export const handleOptions = asyncHandler(async (req, res) => {
  const payload = JSON.parse(req.body.payload);
  const { action_id, value, team } = payload;

  const workspace = await SlackWorkspace.findByTeamId(team.id);
  if (!workspace) {
    return res.json({ options: [] });
  }

  let options = [];

  // Handle project select
  if (action_id === 'project_select') {
    const Board = (await import('../models/Board.js')).default;
    const boards = await Board.find({
      isArchived: false,
      name: value ? { $regex: value, $options: 'i' } : { $exists: true }
    })
      .select('name')
      .limit(25)
      .lean();

    options = boards.map(board => ({
      text: {
        type: 'plain_text',
        text: board.name
      },
      value: board._id.toString()
    }));
  }

  res.json({ options });
});

// ==================== Admin Endpoints ====================

/**
 * @desc    Get Slack workspace settings (admin)
 * @route   GET /api/slack/admin/workspace
 * @access  Private/Admin
 */
export const getWorkspaceSettings = asyncHandler(async (req, res) => {
  const workspace = await SlackWorkspace.findOne({
    installedBy: req.user._id
  }).populate('installedBy', 'name email');

  if (!workspace) {
    throw new ErrorResponse('No Slack workspace found', 404);
  }

  res.json({
    success: true,
    data: {
      teamId: workspace.teamId,
      teamName: workspace.teamName,
      isActive: workspace.isActive,
      healthStatus: workspace.healthStatus,
      installedBy: workspace.installedBy,
      installedAt: workspace.installedAt,
      settings: workspace.settings
    }
  });
});

/**
 * @desc    Update Slack workspace settings (admin)
 * @route   PUT /api/slack/admin/workspace/settings
 * @access  Private/Admin
 */
export const updateWorkspaceSettings = asyncHandler(async (req, res) => {
  const workspace = await SlackWorkspace.findOne({
    installedBy: req.user._id
  });

  if (!workspace) {
    throw new ErrorResponse('No Slack workspace found', 404);
  }

  const allowedSettings = [
    'notificationsEnabled', 'threadedNotifications',
    'batchingEnabled', 'batchIntervalMinutes',
    'digestEnabled', 'digestFrequency', 'digestTime', 'digestTimezone',
    'quietHoursEnabled', 'quietHoursStart', 'quietHoursEnd', 'quietHoursTimezone',
    'maxNotificationsPerMinute',
    'slashCommandsEnabled', 'interactiveActionsEnabled', 'appHomeEnabled',
    'adminNotifications', 'managerNotifications', 'memberNotifications'
  ];

  for (const key of allowedSettings) {
    if (req.body[key] !== undefined) {
      workspace.settings[key] = req.body[key];
    }
  }

  await workspace.save();

  res.json({
    success: true,
    message: 'Workspace settings updated',
    data: { settings: workspace.settings }
  });
});

/**
 * @desc    Get Slack users in workspace (admin)
 * @route   GET /api/slack/admin/users
 * @access  Private/Admin
 */
export const getWorkspaceUsers = asyncHandler(async (req, res) => {
  const workspace = await SlackWorkspace.findOne({
    installedBy: req.user._id
  });

  if (!workspace) {
    throw new ErrorResponse('No Slack workspace found', 404);
  }

  const { page = 1, limit = 20 } = req.query;

  const users = await SlackUser.find({ workspace: workspace._id })
    .populate('user', 'name email role')
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .sort({ linkedAt: -1 });

  const total = await SlackUser.countDocuments({ workspace: workspace._id });

  res.json({
    success: true,
    data: {
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// ==================== Analytics Endpoints ====================

/**
 * @desc    Get Slack notification analytics
 * @route   GET /api/slack/analytics
 * @access  Private/Admin
 */
export const getAnalytics = asyncHandler(async (req, res) => {
  const workspace = await SlackWorkspace.findOne({
    installedBy: req.user._id
  });

  if (!workspace) {
    throw new ErrorResponse('No Slack workspace found', 404);
  }

  const { period = 'daily', days = 30 } = req.query;
  const startDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

  // Get real analytics from SlackNotification collection
  const [summaryStats, topTypes, deliveryStats, trendsData] = await Promise.all([
    // Summary stats
    SlackNotification.aggregate([
      {
        $match: {
          workspace: workspace._id,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalSent: { $sum: 1 },
          totalDelivered: {
            $sum: { $cond: [{ $in: ['$status', ['delivered', 'sent']] }, 1, 0] }
          },
          totalFailed: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
          },
          totalPending: {
            $sum: { $cond: [{ $in: ['$status', ['pending', 'queued']] }, 1, 0] }
          },
          totalInteractions: {
            $sum: { $cond: ['$hasInteraction', 1, 0] }
          },
          avgDeliveryLatency: { $avg: '$metadata.deliveryLatencyMs' }
        }
      }
    ]),
    // Top notification types
    SlackNotification.aggregate([
      {
        $match: {
          workspace: workspace._id,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          delivered: {
            $sum: { $cond: [{ $in: ['$status', ['delivered', 'sent']] }, 1, 0] }
          },
          interactions: {
            $sum: { $cond: ['$hasInteraction', 1, 0] }
          }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]),
    // Delivery stats (last 24 hours)
    SlackNotification.getDeliveryStats(workspace._id, 24),
    // Daily trends
    SlackNotification.aggregate([
      {
        $match: {
          workspace: workspace._id,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          sent: { $sum: 1 },
          delivered: {
            $sum: { $cond: [{ $in: ['$status', ['delivered', 'sent']] }, 1, 0] }
          },
          interactions: {
            $sum: { $cond: ['$hasInteraction', 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ])
  ]);

  const summary = summaryStats[0] || {
    totalSent: 0,
    totalDelivered: 0,
    totalFailed: 0,
    totalPending: 0,
    totalInteractions: 0,
    avgDeliveryLatency: 0
  };

  res.json({
    success: true,
    data: {
      summary,
      trends: trendsData,
      topTypes,
      deliveryStats,
      period,
      startDate,
      endDate: new Date()
    }
  });
});

/**
 * @desc    Get notification history
 * @route   GET /api/slack/notifications
 * @access  Private
 */
export const getNotificationHistory = asyncHandler(async (req, res) => {
  const slackUser = await SlackUser.findOne({
    user: req.user._id,
    isActive: true
  });

  if (!slackUser) {
    throw new ErrorResponse('Slack account not connected', 404);
  }

  const { page = 1, limit = 20, status, type } = req.query;

  const query = { slackUser: slackUser._id };
  if (status) query.status = status;
  if (type) query.type = type;

  const notifications = await SlackNotification.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .lean();

  const total = await SlackNotification.countDocuments(query);

  res.json({
    success: true,
    data: {
      notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// ==================== Health & Debug Endpoints ====================

/**
 * @desc    Get Slack integration health status
 * @route   GET /api/slack/health
 * @access  Private/Admin
 */
export const getHealthStatus = asyncHandler(async (req, res) => {
  const health = await slackHealthCheck();
  res.json({
    success: true,
    data: health
  });
});

/**
 * @desc    Get queue statistics
 * @route   GET /api/slack/admin/queues
 * @access  Private/Admin
 */
export const getQueueStatistics = asyncHandler(async (req, res) => {
  const stats = await getQueueStats();
  res.json({
    success: true,
    data: stats
  });
});

/**
 * @desc    Test Slack notification (debug)
 * @route   POST /api/slack/test
 * @access  Private
 */
export const testNotification = asyncHandler(async (req, res) => {
  const slackUser = await SlackUser.findOne({
    user: req.user._id,
    isActive: true
  }).populate('workspace');

  if (!slackUser) {
    throw new ErrorResponse('Slack account not connected', 404);
  }

  // Send a test notification
  const fakeTaskId = new mongoose.Types.ObjectId();
  const fakeBoardId = new mongoose.Types.ObjectId();
  const result = await slackNotificationService.sendNotification({
    userId: req.user._id,
    type: 'task_assigned',
    task: {
      _id: fakeTaskId,
      title: 'Test Task - Slack Integration',
      description: 'This is a test notification from FlowTask!',
      priority: 'medium',
      status: 'todo',
      board: fakeBoardId
    },
    board: {
      _id: fakeBoardId,
      name: 'Test Project'
    },
    triggeredBy: {
      _id: req.user._id,
      name: req.user.name,
      avatar: req.user.avatar
    },
    customMessage: 'This is a test notification to verify your Slack integration is working correctly!',
    forceImmediate: true
  });

  res.json({
    success: true,
    message: 'Test notification sent',
    data: { notificationId: result?._id }
  });
});

// ==================== Channel Management ====================

/**
 * @desc    Set default notification channel
 * @route   PUT /api/slack/admin/channel
 * @access  Private/Admin
 */
export const setDefaultChannel = asyncHandler(async (req, res) => {
  const { channelId, channelName } = req.body;

  const workspace = await SlackWorkspace.findOne({
    installedBy: req.user._id
  });

  if (!workspace) {
    throw new ErrorResponse('No Slack workspace found', 404);
  }

  workspace.defaultChannelId = channelId;
  workspace.defaultChannelName = channelName;
  await workspace.save();

  res.json({
    success: true,
    message: 'Default channel updated',
    data: {
      channelId,
      channelName
    }
  });
});

/**
 * @desc    Link department to Slack channel
 * @route   PUT /api/slack/admin/department-channel
 * @access  Private/Admin
 */
export const linkDepartmentChannel = asyncHandler(async (req, res) => {
  const { departmentId, channelId, channelName } = req.body;

  const workspace = await SlackWorkspace.findOne({
    installedBy: req.user._id
  });

  if (!workspace) {
    throw new ErrorResponse('No Slack workspace found', 404);
  }

  // Update or add department channel mapping
  const existingIndex = workspace.departments.findIndex(
    d => d.departmentId.toString() === departmentId
  );

  if (existingIndex >= 0) {
    workspace.departments[existingIndex].channelId = channelId;
    workspace.departments[existingIndex].channelName = channelName;
  } else {
    workspace.departments.push({ departmentId, channelId, channelName });
  }

  await workspace.save();

  res.json({
    success: true,
    message: 'Department channel linked',
    data: {
      departmentId,
      channelId,
      channelName
    }
  });
});

/**
 * @desc    Link team to Slack channel
 * @route   PUT /api/slack/admin/team-channel
 * @access  Private/Admin
 */
export const linkTeamChannel = asyncHandler(async (req, res) => {
  const { teamId, channelId, channelName } = req.body;

  const workspace = await SlackWorkspace.findOne({
    installedBy: req.user._id
  });

  if (!workspace) {
    throw new ErrorResponse('No Slack workspace found', 404);
  }

  // Update or add team channel mapping
  const existingIndex = workspace.teams.findIndex(
    t => t.teamId.toString() === teamId
  );

  if (existingIndex >= 0) {
    workspace.teams[existingIndex].channelId = channelId;
    workspace.teams[existingIndex].channelName = channelName;
  } else {
    workspace.teams.push({ teamId, channelId, channelName });
  }

  await workspace.save();

  res.json({
    success: true,
    message: 'Team channel linked',
    data: {
      teamId,
      channelId,
      channelName
    }
  });
});
