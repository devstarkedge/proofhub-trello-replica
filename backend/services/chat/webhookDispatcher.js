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
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[ChatWebhook] Skipping dispatch — missing CHAT_WEBHOOK_URL or FLOWTASK_WEBHOOK_SECRET`);
    }
    return;
  }

  const deliveryId = generateDeliveryId();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify(payload);
  const signaturePayload = `${timestamp}.${body}`;
  const signature = computeSignature(signaturePayload);

  const headers = {
    'Content-Type': 'application/json',
    'X-FlowTask-Signature': signature,
    'X-FlowTask-Timestamp': timestamp,
    'X-FlowTask-Delivery-Id': deliveryId,
    'X-FlowTask-Event': eventName,
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(CHAT_WEBHOOK_URL, body, {
        headers,
        timeout: TIMEOUT_MS,
        // Send raw string body to match signature
        transformRequest: [(data) => data],
      });

      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `[ChatWebhook] Dispatched: ${eventName}, deliveryId: ${deliveryId}, status: ${response.status}`
        );
      }
      return; // Success — exit retry loop
    } catch (error) {
      const status = error.response?.status;
      const isRetryable = !status || status >= 500; // No response (timeout/network) or server error

      if (!isRetryable) {
        // 4xx — do not retry
        console.error(
          `[ChatWebhook] Failed (no-retry): ${eventName}, deliveryId: ${deliveryId}, status: ${status}, error: ${error.message}`
        );
        return;
      }

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt];
        console.warn(
          `[ChatWebhook] Retrying: ${eventName}, deliveryId: ${deliveryId}, attempt: ${attempt + 1}/${MAX_RETRIES}, delay: ${delay}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error(
          `[ChatWebhook] Failed after ${MAX_RETRIES} retries: ${eventName}, deliveryId: ${deliveryId}, error: ${error.message}`
        );
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
