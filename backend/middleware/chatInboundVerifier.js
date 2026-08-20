import crypto from 'crypto';
import logger from '../utils/logger.js';

// Same shared secret both apps already sign/verify the forward
// (FlowTask -> ChatApp) direction with — see services/chat/webhookDispatcher.js
// and workers/chatWebhookWorker.js. Per the user's "one shared platform
// secret, no per-workspace rotation" decision, the reverse direction reuses
// it rather than minting a new one.
const WEBHOOK_SECRET = process.env.FLOWTASK_WEBHOOK_SECRET;
const MAX_TIMESTAMP_SKEW_SECONDS = 300; // 5 minutes, matches ChatApp's own replay-protection window

function computeSignature(payload) {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');
}

/**
 * Verifies inbound HMAC-signed requests from ChatApp (the reverse-sync
 * direction — e.g. WORKSPACE_CREATED). Structurally mirrors ChatApp's own
 * server/middleware/webhookVerifier.js, with headers reversed
 * (X-ChatApp-* instead of X-FlowTask-*). Requires req.rawBody — see
 * server.js's raw-body capture wired for this route, mirroring the
 * existing /api/slack pattern.
 */
export function chatInboundVerifier(req, res, next) {
  const signature = req.headers['x-chatapp-signature'];
  const timestamp = req.headers['x-chatapp-timestamp'];
  const deliveryId = req.headers['x-chatapp-delivery-id'];
  const eventName = req.headers['x-chatapp-event'];

  if (!signature || !timestamp || !deliveryId || !eventName) {
    logger.warn('Chat inbound request missing required signature headers', {
      hasSignature: !!signature,
      hasTimestamp: !!timestamp,
      hasDeliveryId: !!deliveryId,
      hasEventName: !!eventName,
      ip: req.ip,
    });
    return res.status(401).json({ success: false, message: 'Missing webhook security headers' });
  }

  const numericTimestamp = Number.parseInt(timestamp, 10);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(numericTimestamp) || Math.abs(nowSeconds - numericTimestamp) > MAX_TIMESTAMP_SKEW_SECONDS) {
    logger.warn('Chat inbound replay attack detected or clock skew', { deliveryId, eventName, timestamp, serverTime: nowSeconds });
    return res.status(401).json({ success: false, message: 'Webhook timestamp too old — possible replay attack' });
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    logger.error('Chat inbound: raw body not available — check server.js body-parser wiring for this route');
    return res.status(401).json({ success: false, message: 'Unable to verify webhook signature' });
  }

  if (!WEBHOOK_SECRET) {
    logger.error('FLOWTASK_WEBHOOK_SECRET not configured — cannot verify inbound ChatApp requests');
    return res.status(401).json({ success: false, message: 'Webhook verification not configured' });
  }

  const expected = computeSignature(`${timestamp}.${rawBody}`);
  let valid = false;
  try {
    valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  } catch {
    valid = false; // buffers were different lengths
  }

  if (!valid) {
    logger.warn('Chat inbound signature verification failed', { deliveryId, eventName, ip: req.ip });
    return res.status(401).json({ success: false, message: 'Invalid webhook signature' });
  }

  req.chatWebhook = { deliveryId, eventName, timestamp };
  next();
}

export default chatInboundVerifier;
