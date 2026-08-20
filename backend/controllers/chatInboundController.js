import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import * as chatUserProvisioningService from '../services/chat/chatUserProvisioningService.js';
import * as workspaceProvisioningService from '../services/chat/workspaceProvisioningService.js';

/**
 * Receives the reverse-sync WORKSPACE_CREATED announcement from ChatApp
 * (see ChatApp's server/modules/flowtask/flowtaskInboundSync.service.js).
 * Server-to-server, HMAC-authenticated (chatInboundVerifier) — no user
 * session, so request validation replaces the normal auth/authorize chain.
 */
export const handleWorkspaceCreated = asyncHandler(async (req, res, next) => {
  const { chatWorkspaceId, chatWorkspaceName, chatWorkspaceSlug, creator } = req.body || {};

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
  });

  res.status(200).json({ success: true, data: result });
});

export default { handleWorkspaceCreated };
