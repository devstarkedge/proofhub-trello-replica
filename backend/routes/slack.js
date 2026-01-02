/**
 * Slack Routes
 * API endpoints for Slack integration
 */

import express from 'express';
import {
  getOAuthUrl,
  handleOAuthCallback,
  getConnectionStatus,
  disconnectSlack,
  updatePreferences,
  handleEvents,
  handleInteractive,
  handleCommands,
  handleOptions,
  getWorkspaceSettings,
  updateWorkspaceSettings,
  getWorkspaceUsers,
  getAnalytics,
  getNotificationHistory,
  getHealthStatus,
  getQueueStatistics,
  testNotification,
  setDefaultChannel,
  linkDepartmentChannel,
  linkTeamChannel
} from '../controllers/slackController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validateSlackSignature } from '../middleware/slackMiddleware.js';

const router = express.Router();

// ==================== OAuth Routes ====================
router.get('/oauth/url', protect, getOAuthUrl);
router.get('/oauth/callback', handleOAuthCallback);

// ==================== User Connection Routes ====================
router.get('/connection', protect, getConnectionStatus);
router.delete('/connection', protect, disconnectSlack);
router.put('/preferences', protect, updatePreferences);

// ==================== Slack Webhook Routes (must have raw body and signature validation) ====================
router.post('/events', express.raw({ type: 'application/json' }), validateSlackSignature, express.json(), handleEvents);
router.post('/interactive', express.urlencoded({ extended: true }), validateSlackSignature, handleInteractive);
router.post('/commands', express.urlencoded({ extended: true }), validateSlackSignature, handleCommands);
router.post('/options', express.urlencoded({ extended: true }), validateSlackSignature, handleOptions);

// ==================== Admin Routes ====================
router.get('/admin/workspace', protect, authorize('admin'), getWorkspaceSettings);
router.put('/admin/workspace/settings', protect, authorize('admin'), updateWorkspaceSettings);
router.get('/admin/users', protect, authorize('admin'), getWorkspaceUsers);
router.get('/admin/queues', protect, authorize('admin'), getQueueStatistics);
router.put('/admin/channel', protect, authorize('admin'), setDefaultChannel);
router.put('/admin/department-channel', protect, authorize('admin'), linkDepartmentChannel);
router.put('/admin/team-channel', protect, authorize('admin'), linkTeamChannel);

// ==================== Analytics Routes ====================
router.get('/analytics', protect, authorize('admin'), getAnalytics);
router.get('/notifications', protect, getNotificationHistory);

// ==================== Health & Debug Routes ====================
router.get('/health', protect, authorize('admin'), getHealthStatus);
router.post('/test', protect, testNotification);

export default router;
