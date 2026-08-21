import jwt from 'jsonwebtoken';
import axios from 'axios';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import Workspace from '../../models/Workspace.js';
import { createMapping } from './workspaceMappingService.js';
import * as entitlementService from '../../modules/plans/entitlementService.js';

const TIMEOUT_MS = 10000;

/**
 * Eagerly provisions the ChatApp counterpart for a newly-created FlowTask
 * workspace, right at creation time — instead of waiting for the owner to
 * manually click "Open Chat" once (the original Phase 1 design).
 *
 * Deliberately reuses the EXACT same mechanism "Open Chat" already uses
 * (chatIntegrationController.js#getChatRedirectUrl's JWT shape -> ChatApp's
 * POST /api/chat/auth/login/flowtask -> findOrCreateFlowTaskWorkspace) —
 * just invoked server-to-server on behalf of the workspace owner, rather
 * than via a browser redirect. This means it is exercised by the exact same
 * tested, idempotent, race-safe code path on the ChatApp side; no new
 * ChatApp endpoint was needed.
 *
 * Best-effort, non-blocking of correctness: workspace creation must never
 * fail because ChatApp is unreachable. On any failure, nothing is marked
 * "connected" and no mapping is written — the workspace simply falls back
 * to the pre-existing lazy path (the owner's first real "Open Chat" click
 * still works exactly as before and will complete the sync then).
 *
 * @param {object} params
 * @param {object} params.workspace - the newly-created Workspace document
 * @param {object} params.owner - req.user (the workspace creator/owner)
 * @returns {Promise<{chatAppWorkspaceId: string}|null>}
 */
export async function syncWorkspaceToChatApp({ workspace, owner }) {
  const chatAppUrl = config.chat.chatAppUrl;
  const chatJwtSecret = config.chat.jwtSecret;
  if (!chatAppUrl || !chatJwtSecret || !owner) return null;

  // Read live, not passed in by the caller — the entitlement is the source
  // of truth for what ChatApp should provision this workspace as. The
  // caller (workspaceController.js#createWorkspace) awaits subscription
  // creation before calling this, so the real requested plan (not a
  // fallback default) is already persisted by the time we read it here.
  const { planSlug } = await entitlementService.getEntitlements(workspace._id);

  const payload = {
    id: (owner._id || owner.id)?.toString(),
    email: owner.email,
    name: owner.name,
    role: owner.role,
    avatar: owner.avatar || owner.profileImage || '',
    workspaceId: workspace._id.toString(),
    workspaceName: workspace.name,
    workspaceSlug: workspace.slug,
    plan: planSlug,
    source: 'flowtask',
  };
  const token = jwt.sign(payload, chatJwtSecret, { expiresIn: '10m' });

  let response;
  try {
    response = await axios.post(
      `${chatAppUrl.replace(/\/+$/, '')}/api/chat/auth/login/flowtask`,
      { token },
      { timeout: TIMEOUT_MS },
    );
  } catch (err) {
    logger.warn('Eager ChatApp workspace sync failed — will fall back to lazy sync on first Open Chat', {
      workspaceId: workspace._id.toString(),
      error: err.message,
    });
    return null;
  }

  const chatAppWorkspaceId = response.data?.data?.workspaceId;
  if (!chatAppWorkspaceId) {
    logger.warn('Eager ChatApp workspace sync: ChatApp accepted the login but returned no workspaceId', {
      workspaceId: workspace._id.toString(),
    });
    return null;
  }

  await createMapping({
    flowTaskWorkspaceId: workspace._id,
    chatAppWorkspaceId,
    chatAppWorkspaceSlug: workspace.slug,
    syncOrigin: 'user_initiated',
    linkedBy: owner._id || owner.id,
  });

  // Mirrors what chatIntegrationController.js#connect would have set
  // manually — the whole point of eager sync is the admin never has to.
  const webhookUrl = new URL('/api/chat/webhooks/flowtask', chatAppUrl).toString();
  await Workspace.findByIdAndUpdate(workspace._id, {
    $set: {
      'settings.chatIntegration.enabled': true,
      'settings.chatIntegration.webhookUrl': webhookUrl,
      'settings.chatIntegration.chatAppUrl': chatAppUrl.replace(/\/+$/, ''),
      'settings.chatIntegration.connectedAt': new Date(),
      'settings.chatIntegration.connectedBy': owner._id || owner.id,
    },
  });

  logger.info('Workspace eagerly synced to ChatApp', {
    flowTaskWorkspaceId: workspace._id.toString(),
    chatAppWorkspaceId,
  });

  return { chatAppWorkspaceId };
}

export default { syncWorkspaceToChatApp };
