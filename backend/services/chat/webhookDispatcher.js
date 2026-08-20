/**
 * Chat Webhook Dispatcher
 *
 * Sends HMAC-signed webhook events to the Enterprise Chat Application.
 * Follows the same fire-and-forget pattern as slackHooks.js.
 *
 * Security:
 *  - HMAC-SHA256 signature: sha256(timestamp + '.' + body) using FLOWTASK_WEBHOOK_SECRET
 *  - Headers: X-FlowTask-Signature, X-FlowTask-Timestamp, X-FlowTask-Delivery-Id, X-FlowTask-Event
 *  - Retry: 3 attempts with exponential backoff (1s, 5s, 30s) on 5xx/timeout; no retry on 4xx
 *  - No-op when CHAT_ENABLED !== 'true'
 */

import crypto from 'crypto';
import axios from 'axios';
import logger from '../../utils/logger.js';
import chatWebhookQueue from '../../queues/chatWebhookQueue.js';
import Workspace from '../../models/Workspace.js';

// WEBHOOK_SECRET stays a single, deployment-wide value by design (the
// user's explicit "shared platform secret, no per-workspace rotation"
// decision) — only the URL/enablement below become per-workspace.
const CHAT_ENABLED = process.env.CHAT_ENABLED === 'true';
const CHAT_WEBHOOK_URL = process.env.CHAT_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.FLOWTASK_WEBHOOK_SECRET;

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 30000]; // Exponential backoff
const TIMEOUT_MS = 10000;

/**
 * Resolve {enabled, webhookUrl} for the workspace that triggered an event.
 * Falls back to the deployment-wide env vars ONLY when this workspace has
 * never called chatIntegrationController#connect — detected via
 * `connectedAt` (not `enabled`, since Mongoose subdocuments apply schema
 * defaults like `enabled: false` even for workspaces that never touched
 * this setting at all, which would otherwise be indistinguishable from an
 * explicit disconnect). This preserves existing single-tenant/env-var-only
 * deployments unchanged while making explicitly-connected-per-workspace
 * deployments correct — see Workspace.js's `settings.chatIntegration`.
 */
async function resolveWorkspaceChatSettings(workspaceId) {
  if (!workspaceId) return { enabled: CHAT_ENABLED, webhookUrl: CHAT_WEBHOOK_URL };

  const ws = await Workspace.findById(workspaceId).select('settings.chatIntegration').lean();
  const ci = ws?.settings?.chatIntegration;

  if (!ci?.connectedAt) {
    return { enabled: CHAT_ENABLED, webhookUrl: CHAT_WEBHOOK_URL };
  }
  return { enabled: !!ci.enabled, webhookUrl: ci.webhookUrl || CHAT_WEBHOOK_URL };
}

/**
 * Generate a UUID v4 delivery ID.
 */
function generateDeliveryId() {
  return crypto.randomUUID();
}

/**
 * Compute HMAC-SHA256 signature.
 * @param {string} payload - The data to sign (timestamp.body)
 * @returns {string} Hex-encoded HMAC
 */
function computeSignature(payload) {
  return crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
}

/**
 * Dispatch a webhook event to the Chat Application.
 *
 * @param {string} eventName - Event constant (e.g., 'PROJECT_CREATED')
 * @param {object} payload - Event payload matching the integration contract
 * @returns {Promise<void>}
 */
async function dispatch(eventName, payload) {
  if (!payload?.workspaceId) {
    logger.warn('ChatWebhook: skipping dispatch — workspaceId is required', { eventName });
    return;
  }

  const workspaceId = payload.workspaceId;
  const { enabled, webhookUrl } = await resolveWorkspaceChatSettings(workspaceId);

  if (!enabled || !webhookUrl || !WEBHOOK_SECRET) {
    logger.debug('ChatWebhook: skipping dispatch — chat integration not enabled/configured for this workspace', {
      eventName,
      workspaceId,
    });
    return;
  }

  const deliveryId = generateDeliveryId();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const jobId = payload?.eventId
    ? crypto
        .createHash('sha256')
        .update(`${eventName}:${workspaceId}:${payload.eventId}`)
        .digest('hex')
    : deliveryId;
  const body = JSON.stringify(payload);
  const signaturePayload = `${timestamp}.${body}`;
  const signature = computeSignature(signaturePayload);

  const headers = {
    'Content-Type': 'application/json',
    'X-FlowTask-Signature': signature,
    'X-FlowTask-Timestamp': timestamp,
    'X-FlowTask-Delivery-Id': deliveryId,
    'X-FlowTask-Event': eventName,
    ...(workspaceId ? { 'X-FlowTask-Workspace': workspaceId.toString() } : {}),
  };

  // Prefer enqueuing webhook dispatch to a Redis-backed queue for reliability
  try {
    if (chatWebhookQueue) {
      await chatWebhookQueue.add('dispatch', { eventName, payload, deliveryId: jobId, webhookUrl }, {
        jobId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 86400, count: 10000 },
        removeOnFail: false,
      });
      logger.debug('ChatWebhook: enqueued dispatch job', { eventName, deliveryId: jobId, workspaceId });
      return;
    }
  } catch (err) {
    logger.warn('ChatWebhook: enqueue failed, falling back to direct dispatch', { error: err.message });
    // fallthrough to direct dispatch below
  }

  // Fallback: inline HTTP dispatch (legacy behavior)
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(webhookUrl, body, {
        headers,
        timeout: TIMEOUT_MS,
        // Send raw string body to match signature
        transformRequest: [(data) => data],
      });

      logger.info('ChatWebhook: dispatched (inline)', {
        eventName,
        deliveryId,
        workspaceId,
        status: response.status,
        attempt: attempt + 1,
      });
      return; // Success — exit retry loop
    } catch (error) {
      const status = error.response?.status;
      const isRetryable = !status || status >= 500; // No response (timeout/network) or server error

      if (!isRetryable) {
        // 4xx — do not retry
        logger.error('ChatWebhook: failed (no-retry)', {
          eventName,
          deliveryId,
          workspaceId,
          status,
          error: error.message,
        });
        return;
      }

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt];
        logger.warn('ChatWebhook: retrying (inline)', {
          eventName,
          deliveryId,
          workspaceId,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          delay,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        logger.error('ChatWebhook: failed after retries (inline)', {
          eventName,
          deliveryId,
          workspaceId,
          retries: MAX_RETRIES,
          error: error.message,
        });
      }
    }
  }
}

/**
 * Check if chat webhook dispatching is enabled at the deployment level
 * (env-var fallback state only — does NOT reflect any specific workspace's
 * per-workspace connect/disconnect setting). Kept for any remaining
 * deployment-wide-only checks; prefer isEnabledForWorkspace for anything
 * workspace-scoped.
 * @returns {boolean}
 */
function isEnabled() {
  return CHAT_ENABLED && !!CHAT_WEBHOOK_URL && !!WEBHOOK_SECRET;
}

/**
 * Check if chat webhook dispatching is enabled for a specific workspace —
 * respects that workspace's own connect/disconnect state once it has ever
 * called connect, falling back to the deployment env vars otherwise.
 * @param {string} workspaceId
 * @returns {Promise<boolean>}
 */
async function isEnabledForWorkspace(workspaceId) {
  const { enabled, webhookUrl } = await resolveWorkspaceChatSettings(workspaceId);
  return enabled && !!webhookUrl && !!WEBHOOK_SECRET;
}

export default { dispatch, isEnabled, isEnabledForWorkspace };
