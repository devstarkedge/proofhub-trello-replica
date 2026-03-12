import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import config from '../config/index.js';
import webhookDispatcher from '../services/chat/webhookDispatcher.js';

/**
 * @desc    Get current chat integration status
 * @route   GET /api/chat-integration/status
 * @access  Private (Admin)
 */
export const getStatus = asyncHandler(async (req, res) => {
  const isConnected = webhookDispatcher.isEnabled();

  res.json({
    success: true,
    data: {
      connected: isConnected,
      chatUrl: isConnected ? config.chat.webhookUrl?.replace(/\/api\/.*$/, '') : null,
      lastSyncAt: null, // Could be stored in DB if tracking
    },
  });
});

/**
 * @desc    Connect ChatApp integration — generates a webhook secret and
 *          stores the ChatApp URL. The admin provides the ChatApp base URL,
 *          and we return the webhook secret they need to configure on ChatApp side.
 * @route   POST /api/chat-integration/connect
 * @access  Private (Admin)
 */
export const connect = asyncHandler(async (req, res, next) => {
  const { chatAppUrl } = req.body;

  if (!chatAppUrl) {
    return next(new ErrorResponse('chatAppUrl is required', 400));
  }

  // Validate URL format
  let parsedUrl;
  try {
    parsedUrl = new URL(chatAppUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid protocol');
    }
  } catch {
    return next(new ErrorResponse('Invalid chatAppUrl — must be a valid HTTP(S) URL', 400));
  }

  // Generate a new webhook secret
  const webhookSecret = crypto.randomBytes(32).toString('hex');

  // Build the webhook endpoint URL
  const webhookUrl = new URL('/api/chat/webhooks/flowtask', parsedUrl.origin).toString();

  // Update runtime config (for this process)
  config.chat.enabled = true;
  config.chat.webhookUrl = webhookUrl;
  config.chat.webhookSecret = webhookSecret;

  // Note: In production, these should be persisted to a settings collection
  // or written to env management. For now, we set them at runtime and
  // the admin must also update the .env for persistence across restarts.

  res.json({
    success: true,
    data: {
      connected: true,
      webhookUrl,
      webhookSecret,
      message: 'Chat integration connected. Save the webhookSecret — configure it in ChatApp as FLOWTASK_WEBHOOK_SECRET.',
    },
  });
});

/**
 * @desc    Disconnect ChatApp integration
 * @route   POST /api/chat-integration/disconnect
 * @access  Private (Admin)
 */
export const disconnect = asyncHandler(async (req, res) => {
  config.chat.enabled = false;
  config.chat.webhookUrl = '';
  config.chat.webhookSecret = '';

  res.json({
    success: true,
    data: {
      connected: false,
      message: 'Chat integration disconnected.',
    },
  });
});

/**
 * @desc    Trigger a test webhook to verify connectivity
 * @route   POST /api/chat-integration/test
 * @access  Private (Admin)
 */
export const testConnection = asyncHandler(async (req, res, next) => {
  if (!webhookDispatcher.isEnabled()) {
    return next(new ErrorResponse('Chat integration is not connected', 400));
  }

  try {
    await webhookDispatcher.dispatch('INTEGRATION_TEST', {
      message: 'Test event from FlowTask',
      timestamp: new Date().toISOString(),
      triggeredBy: {
        userId: req.user._id,
        name: req.user.name,
      },
    });

    res.json({
      success: true,
      data: { message: 'Test webhook dispatched successfully' },
    });
  } catch (err) {
    return next(new ErrorResponse(`Webhook test failed: ${err.message}`, 502));
  }
});

/**
 * @desc    Get a redirect URL to ChatApp with a short-lived JWT.
 *          The JWT contains user identity so ChatApp can auto-login the user.
 * @route   GET /api/chat-integration/redirect
 * @access  Private
 */
export const getChatRedirectUrl = asyncHandler(async (req, res, next) => {
  const chatAppUrl = config.chat.chatAppUrl;
  const chatJwtSecret = config.chat.jwtSecret;

  if (!chatAppUrl) {
    return next(new ErrorResponse('ChatApp URL is not configured. Set CHATAPP_URL in environment.', 400));
  }
  if (!chatJwtSecret) {
    return next(new ErrorResponse('Chat JWT secret is not configured. Set CHAT_JWT_SECRET in environment.', 400));
  }

  // Generate a short-lived JWT (5 minutes) with user identity
  const payload = {
    id: req.user._id || req.user.id,
    email: req.user.email,
    name: req.user.name,
    role: req.user.role,
    avatar: req.user.avatar || req.user.profileImage || '',
    source: 'flowtask',
  };

  const token = jwt.sign(payload, chatJwtSecret, { expiresIn: '10m' });

  // Build redirect URL
  const redirectUrl = `${chatAppUrl.replace(/\/+$/, '')}/login?token=${encodeURIComponent(token)}&source=flowtask`;

  res.json({
    success: true,
    data: {
      redirectUrl,
    },
  });
});

/**
 * @desc    Trigger a full sync (all users + all boards)
 * @route   POST /api/chat-integration/sync
 * @access  Private (Admin)
 */
export const triggerSync = asyncHandler(async (req, res, next) => {
  if (!webhookDispatcher.isEnabled()) {
    return next(new ErrorResponse('Chat integration is not connected', 400));
  }

  // Dispatch a SYNC_REQUESTED event — ChatApp's webhook handler
  // will orchestrate the actual sync using its sync.service.js
  await webhookDispatcher.dispatch('SYNC_REQUESTED', {
    requestedBy: {
      userId: req.user._id,
      name: req.user.name,
    },
    requestedAt: new Date().toISOString(),
  });

  res.json({
    success: true,
    data: { message: 'Sync request dispatched to ChatApp' },
  });
});
