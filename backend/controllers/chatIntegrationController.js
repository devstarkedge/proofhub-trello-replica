import jwt from 'jsonwebtoken';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import config from '../config/index.js';
import webhookDispatcher from '../services/chat/webhookDispatcher.js';
import Board from '../models/Board.js';
import Workspace from '../models/Workspace.js';
import WorkspaceIntegrationMapping from '../models/WorkspaceIntegrationMapping.js';
import { getProjectMembershipSnapshot } from '../services/chat/projectMembershipService.js';
import chatHooks from '../utils/chatHooks.js';
import { resolveWorkspaceIdFromRequest } from '../services/chat/workspaceMappingService.js';

/**
 * @desc    Get current chat integration status for the active workspace
 * @route   GET /api/chat-integration/status
 * @access  Private (Admin)
 */
export const getStatus = asyncHandler(async (req, res) => {
  const workspaceId = resolveWorkspaceIdFromRequest(req);
  if (!workspaceId) {
    return res.json({ success: true, data: { connected: false, chatUrl: null, lastSyncAt: null } });
  }

  const [workspace, mapping] = await Promise.all([
    Workspace.findById(workspaceId).select('settings.chatIntegration').lean(),
    WorkspaceIntegrationMapping.findOne({ flowTaskWorkspaceId: workspaceId, status: 'active' }).lean(),
  ]);
  const ci = workspace?.settings?.chatIntegration;
  // "Connected" reflects whether this workspace actually HAS a linked
  // ChatApp counterpart — WorkspaceIntegrationMapping is the source of
  // truth (populated by eager sync at creation, the one-time migration
  // script for the original pre-existing workspace, or the lazy Open Chat
  // path), not just the chatIntegration.enabled toggle, which older/
  // migrated workspaces may never have had set even though they ARE
  // genuinely linked. An explicit disconnect() still overrides this.
  const isConnected = !!mapping && ci?.enabled !== false;

  // Prefer this workspace's own configured ChatApp frontend URL for display,
  // falling back to the deployment-wide one if this workspace's own setting
  // was never populated (e.g. linked only via the one-time migration).
  const displayChatUrl = isConnected
    ? (ci?.chatAppUrl?.replace(/\/+$/, '') || ci?.webhookUrl?.replace(/\/api\/.*$/, '') || config.chat.chatAppUrl?.replace(/\/+$/, ''))
    : null;

  res.json({
    success: true,
    data: {
      connected: isConnected,
      chatUrl: displayChatUrl,
      lastSyncAt: mapping?.linkedAt || null,
    },
  });
});

/**
 * @desc    Connect ChatApp integration for the active workspace only —
 *          stores the ChatApp URL on this Workspace's own settings.
 *          Signing/verification still uses the single, deployment-wide
 *          FLOWTASK_WEBHOOK_SECRET (shared-secret model) — there is no
 *          per-workspace secret to generate or copy.
 * @route   POST /api/chat-integration/connect
 * @access  Private (Admin)
 */
export const connect = asyncHandler(async (req, res, next) => {
  const { chatAppUrl, chatFrontendUrl } = req.body;
  const workspaceId = resolveWorkspaceIdFromRequest(req);

  if (!workspaceId) {
    return next(new ErrorResponse('Workspace context is required to connect chat integration', 400));
  }
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

  const webhookUrl = new URL('/api/chat/webhooks/flowtask', parsedUrl.origin).toString();

  let chatAppDisplayUrl = parsedUrl.origin;
  if (chatFrontendUrl) {
    try {
      const parsedFrontend = new URL(chatFrontendUrl);
      chatAppDisplayUrl = parsedFrontend.origin.replace(/\/+$/, '');
    } catch (e) {
      // ignore invalid frontend URL — we still have the webhookUrl configured
    }
  }

  await Workspace.findByIdAndUpdate(workspaceId, {
    $set: {
      'settings.chatIntegration.enabled': true,
      'settings.chatIntegration.webhookUrl': webhookUrl,
      'settings.chatIntegration.chatAppUrl': chatAppDisplayUrl,
      'settings.chatIntegration.connectedAt': new Date(),
      'settings.chatIntegration.connectedBy': req.user._id,
    },
  });

  res.json({
    success: true,
    data: {
      connected: true,
      webhookUrl,
      chatUrl: chatAppDisplayUrl,
      message: 'Chat integration connected for this workspace. ChatApp verifies incoming events using the shared FLOWTASK_WEBHOOK_SECRET already configured on this deployment — there is no per-workspace secret to copy.',
    },
  });
});

/**
 * @desc    Disconnect ChatApp integration for the active workspace only
 * @route   POST /api/chat-integration/disconnect
 * @access  Private (Admin)
 */
export const disconnect = asyncHandler(async (req, res, next) => {
  const workspaceId = resolveWorkspaceIdFromRequest(req);
  if (!workspaceId) {
    return next(new ErrorResponse('Workspace context is required to disconnect chat integration', 400));
  }

  await Workspace.findByIdAndUpdate(workspaceId, {
    $set: { 'settings.chatIntegration.enabled': false },
  });

  res.json({
    success: true,
    data: {
      connected: false,
      message: 'Chat integration disconnected for this workspace.',
    },
  });
});

/**
 * @desc    Trigger a test webhook to verify connectivity
 * @route   POST /api/chat-integration/test
 * @access  Private (Admin)
 */
export const testConnection = asyncHandler(async (req, res, next) => {
  const workspaceId = resolveWorkspaceIdFromRequest(req);
  if (!workspaceId) {
    return next(new ErrorResponse('Workspace context is required to test chat integration', 400));
  }
  if (!(await webhookDispatcher.isEnabledForWorkspace(workspaceId))) {
    return next(new ErrorResponse('Chat integration is not connected for this workspace', 400));
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

  // Workspace name/slug are display-only hints for ChatApp to name a
  // brand-new workspace on first login — not workspace-owned data, safe to
  // query without an ambient workspace context.
  let workspaceName = null;
  let workspaceSlug = null;
  if (workspaceId) {
    const ws = await Workspace.findById(workspaceId).select('name slug').lean();
    workspaceName = ws?.name || null;
    workspaceSlug = ws?.slug || null;
  }

  // Generate a short-lived JWT (5 minutes) with user identity
  const payload = {
    id: req.user._id || req.user.id,
    email: req.user.email,
    name: req.user.name,
    role: req.user.role,
    avatar: req.user.avatar || req.user.profileImage || '',
    workspaceId,
    workspaceName,
    workspaceSlug,
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
  const workspaceId = resolveWorkspaceIdFromRequest(req);
  if (!workspaceId) {
    return next(new ErrorResponse('Workspace context is required to trigger chat sync', 400));
  }
  if (!(await webhookDispatcher.isEnabledForWorkspace(workspaceId))) {
    return next(new ErrorResponse('Chat integration is not connected for this workspace', 400));
  }

  // Dispatch a SYNC_REQUESTED event — ChatApp's webhook handler
  // will orchestrate the actual sync using its sync.service.js
  let dispatchedProjects = 0;
  const cursor = Board.find({
    visibility: 'public',
    isArchived: { $ne: true },
    isDeleted: { $ne: true },
  }).cursor();

  for await (const board of cursor) {
    await chatHooks.onProjectCreated(board, req.user);
    dispatchedProjects += 1;
  }

  res.json({
    success: true,
    data: {
      message: 'Project reconciliation dispatched to ChatApp',
      dispatchedProjects,
    },
  });
});

/**
 * Return the exact project, task, subtask, and nano-subtask participant union.
 */
export const getProjectParticipants = asyncHandler(async (req, res, next) => {
  const snapshot = await getProjectMembershipSnapshot(req.params.projectId);
  if (!snapshot) {
    return next(new ErrorResponse('Project not found', 404));
  }

  const requesterId = req.user.id || req.user._id?.toString();
  const isParticipant = snapshot.participants.some(
    (participant) => participant.flowTaskUserId === requesterId,
  );
  const canViewPublicProject = snapshot.project.sourceVisibility === 'public';
  const isAdmin = req.user.role === 'admin';

  if (!isParticipant && !canViewPublicProject && !isAdmin) {
    return next(new ErrorResponse('Not authorized to access this project', 403));
  }

  res.json({ success: true, data: snapshot });
});
