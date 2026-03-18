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

const CHAT_ENABLED = process.env.CHAT_ENABLED === 'true';
const CHAT_WEBHOOK_URL = process.env.CHAT_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.FLOWTASK_WEBHOOK_SECRET;

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 30000]; // Exponential backoff
const TIMEOUT_MS = 10000;

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
  // Guard: disabled or not configured
  if (!CHAT_ENABLED) return;

  if (!CHAT_WEBHOOK_URL || !WEBHOOK_SECRET) {
    logger.debug('ChatWebhook: skipping dispatch — missing CHAT_WEBHOOK_URL or FLOWTASK_WEBHOOK_SECRET');
    return;
  }

  if (!payload?.workspaceId) {
    logger.warn('ChatWebhook: skipping dispatch — workspaceId is required', { eventName });
    return;
  }

  const deliveryId = generateDeliveryId();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const workspaceId = payload?.workspaceId || null;
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

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(CHAT_WEBHOOK_URL, body, {
        headers,
        timeout: TIMEOUT_MS,
        // Send raw string body to match signature
        transformRequest: [(data) => data],
      });

      logger.info('ChatWebhook: dispatched', {
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
        logger.warn('ChatWebhook: retrying', {
          eventName,
          deliveryId,
          workspaceId,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          delay,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        logger.error('ChatWebhook: failed after retries', {
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
 * Check if chat webhook dispatching is enabled.
 * @returns {boolean}
 */
function isEnabled() {
  return CHAT_ENABLED && !!CHAT_WEBHOOK_URL && !!WEBHOOK_SECRET;
}

export default { dispatch, isEnabled };
