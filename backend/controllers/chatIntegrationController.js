import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import config from '../config/index.js';
import webhookDispatcher from '../services/chat/webhookDispatcher.js';

function resolveWorkspaceIdFromRequest(req) {
  const fromHeader = req.headers['x-workspace-id'];
  if (fromHeader) return fromHeader.toString();

  const fromQuery = req.query?.workspaceId;
  if (fromQuery) return fromQuery.toString();

  const departments = req.user?.department;
  if (Array.isArray(departments) && departments.length > 0) {
    const first = departments[0];
    return (first?._id || first)?.toString?.() || null;
  }

  return null;
}

/**
 * @desc    Get current chat integration status
 * @route   GET /api/chat-integration/status
 * @access  Private (Admin)
 */
export const getStatus = asyncHandler(async (req, res) => {
  const isConnected = webhookDispatcher.isEnabled();

  // Prefer an explicitly configured Chat frontend URL for display (CHATAPP_URL).
  // Fallback to the origin of the webhookUrl (stripping /api/*) if frontend URL isn't set.
  const displayChatUrl = isConnected
    ? (config.chat.chatAppUrl?.replace(/\/+$/, '') || config.chat.webhookUrl?.replace(/\/api\/.*$/, ''))
    : null;

  res.json({
    success: true,
    data: {
      connected: isConnected,
      chatUrl: displayChatUrl,
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
  const { chatAppUrl, chatFrontendUrl } = req.body;

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

  // If admin provided an explicit frontend URL for ChatApp, use it for redirects/display.
  if (chatFrontendUrl) {
    try {
      const parsedFrontend = new URL(chatFrontendUrl);
      config.chat.chatAppUrl = parsedFrontend.origin.replace(/\/+$/, '');
    } catch (e) {
      // ignore invalid frontend URL — we still have the webhookUrl configured
    }
  }

  // Note: In production, these should be persisted to a settings collection
  // or written to env management. For now, we set them at runtime and
  // the admin must also update the .env for persistence across restarts.

  res.json({
    success: true,
    data: {
      connected: true,
      webhookUrl,
      webhookSecret,
      // Provide a display chat URL to the client (prefer configured frontend URL)
      chatUrl: config.chat.chatAppUrl?.replace(/\/+$/, '') || parsedUrl.origin,
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

  const workspaceId = resolveWorkspaceIdFromRequest(req);
  if (!workspaceId) {
    return next(new ErrorResponse('Workspace context is required to test chat integration', 400));
  }

  try {
    await webhookDispatcher.dispatch('INTEGRATION_TEST', {
      workspaceId,
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
  const workspaceId = resolveWorkspaceIdFromRequest(req);

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
    workspaceId,
    source: 'flowtask',
  };

  const token = jwt.sign(payload, chatJwtSecret, { expiresIn: '10m' });

  // Build redirect URL
  const workspaceQuery = workspaceId ? `&workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const redirectUrl = `${chatAppUrl.replace(/\/+$/, '')}/login?token=${encodeURIComponent(token)}&source=flowtask${workspaceQuery}`;

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

  const workspaceId = resolveWorkspaceIdFromRequest(req);
  if (!workspaceId) {
    return next(new ErrorResponse('Workspace context is required to trigger chat sync', 400));
  }

  // Dispatch a SYNC_REQUESTED event — ChatApp's webhook handler
  // will orchestrate the actual sync using its sync.service.js
  await webhookDispatcher.dispatch('SYNC_REQUESTED', {
    workspaceId,
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
