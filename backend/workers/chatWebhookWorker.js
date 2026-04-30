import { Worker } from 'bullmq';
import { getWorkerConnection } from '../queues/connection.js';
import axios from 'axios';
import crypto from 'crypto';
import logger from '../utils/logger.js';

const CHAT_WEBHOOK_URL = process.env.CHAT_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.FLOWTASK_WEBHOOK_SECRET;
const TIMEOUT_MS = 10000;

function computeSignature(payload) {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');
}

let _worker = null;

export function startChatWebhookWorker(options = { concurrency: 5 }) {
  if (_worker) return _worker;

  _worker = new Worker('chat-webhooks', async (job) => {
    const { eventName, payload } = job.data;

    if (!CHAT_WEBHOOK_URL || !WEBHOOK_SECRET) {
      logger.warn('chatWebhookWorker: missing config; skipping job', { jobId: job.id });
      return;
    }

    if (!payload?.workspaceId) {
      logger.warn('chatWebhookWorker: missing workspaceId; skipping job', { jobId: job.id, eventName });
      return;
    }

    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signaturePayload = `${timestamp}.${body}`;
    const signature = computeSignature(signaturePayload);
    const headers = {
      'Content-Type': 'application/json',
      'X-FlowTask-Signature': signature,
      'X-FlowTask-Timestamp': timestamp,
      'X-FlowTask-Delivery-Id': job.id.toString(),
      'X-FlowTask-Event': eventName,
      'X-FlowTask-Workspace': payload.workspaceId.toString(),
    };

    try {
      const resp = await axios.post(CHAT_WEBHOOK_URL, body, {
        headers,
        timeout: TIMEOUT_MS,
        transformRequest: [(data) => data],
      });
      logger.info('chatWebhookWorker: dispatched', { jobId: job.id, status: resp.status, eventName, workspaceId: payload.workspaceId });
      return;
    } catch (err) {
      const status = err.response?.status;
      if (status && status >= 400 && status < 500) {
        // Non-retryable client error — log and do not retry
        logger.error('chatWebhookWorker: non-retryable failure', { jobId: job.id, status, eventName, error: err.message });
        return;
      }
      // For network/5xx errors, throw to allow BullMQ to retry
      logger.warn('chatWebhookWorker: retryable failure, will throw to retry', { jobId: job.id, eventName, error: err.message });
      throw err;
    }
  }, {
    connection: getWorkerConnection(),
    concurrency: options.concurrency || 5,
  });

  _worker.on('failed', (job, err) => {
    logger.error('chatWebhookWorker job failed', { jobId: job.id, name: job.name, attemptsMade: job.attemptsMade, err: err.message });
  });

  return _worker;
}

export function getChatWebhookWorker() {
  return _worker;
}
