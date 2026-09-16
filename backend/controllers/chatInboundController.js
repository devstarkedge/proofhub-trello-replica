import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import * as chatUserProvisioningService from '../services/chat/chatUserProvisioningService.js';
import * as workspaceProvisioningService from '../services/chat/workspaceProvisioningService.js';
import * as workspaceMappingService from '../services/chat/workspaceMappingService.js';
import Workspace from '../models/Workspace.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import { deleteFromCloudinary, uploadWorkspaceIconToCloudinary } from '../utils/cloudinary.js';
import { emitToUser } from '../realtime/index.js';
import config from '../config/index.js';
import axios from 'axios';

/**
 * Receives the reverse-sync WORKSPACE_CREATED announcement from ChatApp
 * (see ChatApp's server/modules/flowtask/flowtaskInboundSync.service.js).
 * Server-to-server, HMAC-authenticated (chatInboundVerifier) — no user
 * session, so request validation replaces the normal auth/authorize chain.
 */
export const handleWorkspaceCreated = asyncHandler(async (req, res, next) => {
  const { chatWorkspaceId, chatWorkspaceName, chatWorkspaceSlug, chatWorkspaceLogo, creator } = req.body || {};

  if (!chatWorkspaceId || !/^[0-9a-fA-F]{24}$/.test(chatWorkspaceId)) {
    return next(new ErrorResponse('chatWorkspaceId (24-hex ChatApp Workspace id) is required', 400));
  }
  if (!creator?.email) {
    return next(new ErrorResponse('creator.email is required', 400));
  }

  const user = await chatUserProvisioningService.upsertFromChatApp(creator);
  const result = await workspaceProvisioningService.provisionFromChatApp({
    ownerId: user._id,
    chatWorkspaceId,
    chatWorkspaceName,
    chatWorkspaceSlug,
    chatWorkspaceLogo,
  });

  res.status(200).json({ success: true, data: result });
});

function parseChatWebhookUrl(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const parsed = new URL(value.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function reconcileChatWorkspaceLink({
  flowTaskWorkspaceId,
  chatWorkspaceId,
  chatWorkspaceSlug,
  chatWebhookUrl,
}) {
  const workspace = await Workspace.findById(flowTaskWorkspaceId).select('_id').lean();
  if (!workspace) return null;

  const mapping = await workspaceMappingService.reconcileMapping({
    flowTaskWorkspaceId,
    chatAppWorkspaceId: chatWorkspaceId,
    chatAppWorkspaceSlug: chatWorkspaceSlug || null,
    syncOrigin: 'user_initiated',
  });

  const normalizedWebhookUrl = parseChatWebhookUrl(config.chat.webhookUrl || chatWebhookUrl);
  if (normalizedWebhookUrl) {
    await Workspace.findByIdAndUpdate(flowTaskWorkspaceId, {
      $set: {
        'settings.chatIntegration.enabled': true,
        'settings.chatIntegration.webhookUrl': normalizedWebhookUrl,
        'settings.chatIntegration.connectedAt': new Date(),
      },
    });
  }

  return mapping;
}

/**
 * Completes/repairs FlowTask's side of a workspace pair after an SSO login.
 * The request is protected by chatInboundVerifier at the route boundary.
 */
export const handleWorkspaceLinked = asyncHandler(async (req, res, next) => {
  const {
    chatWorkspaceId,
    chatWorkspaceSlug,
    flowTaskWorkspaceId,
    chatWebhookUrl,
  } = req.body || {};
  if (!chatWorkspaceId || !/^[0-9a-fA-F]{24}$/.test(chatWorkspaceId)) {
    return next(new ErrorResponse('chatWorkspaceId (24-hex ChatApp Workspace id) is required', 400));
  }
  if (!flowTaskWorkspaceId || !/^[0-9a-fA-F]{24}$/.test(flowTaskWorkspaceId)) {
    return next(new ErrorResponse('flowTaskWorkspaceId (24-hex FlowTask Workspace id) is required', 400));
  }

  let mapping;
  try {
    mapping = await reconcileChatWorkspaceLink({
      flowTaskWorkspaceId,
      chatWorkspaceId,
      chatWorkspaceSlug,
      chatWebhookUrl,
    });
  } catch (error) {
    if (error.code === 'WORKSPACE_MAPPING_CONFLICT' || error.code === 11000) {
      return next(new ErrorResponse(error.message || 'Workspace mapping conflict', 409));
    }
    throw error;
  }
  if (!mapping) return next(new ErrorResponse('FlowTask workspace not found', 404));

  res.status(200).json({
    success: true,
    data: {
      flowTaskWorkspaceId: String(mapping.flowTaskWorkspaceId),
      chatWorkspaceId: mapping.chatAppWorkspaceId,
    },
  });
});

/**
 * Applies ChatApp-originated shared metadata directly to FlowTask. This does
 * not invoke chatHooks.onWorkspaceUpdated, so the inbound write cannot echo
 * straight back to ChatApp and create a synchronization loop.
 */
export const handleWorkspaceUpdated = asyncHandler(async (req, res, next) => {
  const { chatWorkspaceId, flowTaskWorkspaceId, workspace: incoming } = req.body || {};
  if (!chatWorkspaceId || !/^[0-9a-fA-F]{24}$/.test(chatWorkspaceId)) {
    return next(new ErrorResponse('chatWorkspaceId (24-hex ChatApp Workspace id) is required', 400));
  }
  if (!incoming || typeof incoming !== 'object') {
    return next(new ErrorResponse('workspace metadata is required', 400));
  }

  let mapping = await workspaceMappingService.findByChatAppWorkspaceId(chatWorkspaceId);
  if (!mapping && flowTaskWorkspaceId && /^[0-9a-fA-F]{24}$/.test(flowTaskWorkspaceId)) {
    try {
      mapping = await reconcileChatWorkspaceLink({
        flowTaskWorkspaceId,
        chatWorkspaceId,
        chatWorkspaceSlug: req.body?.chatWorkspaceSlug,
        chatWebhookUrl: req.body?.chatWebhookUrl,
      });
    } catch (error) {
      if (error.code === 'WORKSPACE_MAPPING_CONFLICT' || error.code === 11000) {
        return next(new ErrorResponse(error.message || 'Workspace mapping conflict', 409));
      }
      throw error;
    }
  }
  if (!mapping) {
    return next(new ErrorResponse('No active FlowTask workspace mapping exists for this ChatApp workspace', 404));
  }
  if (flowTaskWorkspaceId && String(mapping.flowTaskWorkspaceId) !== String(flowTaskWorkspaceId)) {
    return next(new ErrorResponse('Workspace mapping mismatch', 409));
  }

  const updates = {};
  let removeIcon = false;
  if (typeof incoming.name === 'string' && incoming.name.trim()) {
    updates.name = incoming.name.trim().slice(0, 100);
  }

  if (incoming.logo === null || typeof incoming.logo === 'string') {
    const logo = typeof incoming.logo === 'string' ? incoming.logo.trim() : '';
    if (logo) {
      let parsed;
      try {
        parsed = new URL(logo);
      } catch {
        return next(new ErrorResponse('workspace.logo must be a valid URL or null', 400));
      }
      if (!['http:', 'https:'].includes(parsed.protocol) || logo.length > 2048) {
        return next(new ErrorResponse('workspace.logo must be an HTTP(S) URL no longer than 2048 characters', 400));
      }
      
      // If req.body.changes.logo exists and has a new value, we should download and upload to our own Cloudinary
      if (req.body.changes && req.body.changes.logo && req.body.changes.logo.new) {
        try {
          const response = await axios.get(logo, { responseType: 'arraybuffer' });
          const buffer = Buffer.from(response.data);
          const uploadResult = await uploadWorkspaceIconToCloudinary(buffer, {
            originalName: 'chat-app-logo',
            mimetype: response.headers['content-type'] || 'image/png'
          });
          updates.icon = {
            url: uploadResult.secure_url,
            publicId: uploadResult.public_id,
            format: uploadResult.format,
            isSvg: uploadResult.format === 'svg',
            smallUrl: uploadResult.secure_url,
            mediumUrl: uploadResult.secure_url,
            largeUrl: uploadResult.secure_url,
            uploadedAt: new Date(),
            uploadedBy: null,
          };
        } catch (error) {
          console.error('Failed to transfer workspace logo to FlowTask Cloudinary, falling back to original URL:', error.message);
          updates.icon = {
            url: logo,
            publicId: null,
            format: null,
            isSvg: /\.svg(?:$|\?)/i.test(parsed.pathname),
            smallUrl: logo,
            mediumUrl: logo,
            largeUrl: logo,
            uploadedAt: new Date(),
            uploadedBy: null,
          };
        }
      } else {
        updates.icon = {
          url: logo,
          publicId: null,
          format: null,
          isSvg: /\.svg(?:$|\?)/i.test(parsed.pathname),
          smallUrl: logo,
          mediumUrl: logo,
          largeUrl: logo,
          uploadedAt: new Date(),
          uploadedBy: null,
        };
      }
    } else {
      removeIcon = true;
    }
  }

  if (Object.keys(updates).length === 0 && !removeIcon) {
    return next(new ErrorResponse('No valid shared workspace fields to update', 400));
  }

  const previous = await Workspace.findById(mapping.flowTaskWorkspaceId).select('icon').lean();
  if (!previous) return next(new ErrorResponse('Mapped FlowTask workspace not found', 404));

  const updateOperation = removeIcon
    ? { ...(Object.keys(updates).length ? { $set: updates } : {}), $unset: { icon: 1 } }
    : { $set: updates };
  const updated = await Workspace.findByIdAndUpdate(
    mapping.flowTaskWorkspaceId,
    updateOperation,
    { new: true, runValidators: true },
  );

  const oldPublicId = previous.icon?.publicId;
  if (oldPublicId && oldPublicId !== updated.icon?.publicId) {
    deleteFromCloudinary(oldPublicId, 'image').catch((error) => {
      console.error('Failed to remove replaced FlowTask workspace icon:', error);
    });
  }

  const memberIds = await WorkspaceMembership.find({
    workspace: updated._id,
    status: 'active',
  }).distinct('user');
  const payload = {
    workspaceId: updated._id.toString(),
    workspace: { name: updated.name, icon: updated.icon?.url ? updated.icon : null },
  };
  for (const userId of memberIds) {
    emitToUser(userId.toString(), 'workspace-updated', payload);
  }

  res.status(200).json({ success: true, data: payload.workspace });
});

export default { handleWorkspaceCreated, handleWorkspaceLinked, handleWorkspaceUpdated };
