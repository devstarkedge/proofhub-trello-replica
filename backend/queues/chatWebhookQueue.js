import { Queue } from 'bullmq';
import { getSharedConnection } from './connection.js';

const chatWebhookQueue = new Queue('chat-webhooks', {
  connection: getSharedConnection(),
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
    // Retain completed event IDs briefly so BullMQ can suppress duplicate
    // deliveries caused by concurrent hooks/retries.
    removeOnComplete: { age: 86400, count: 10000 },
    removeOnFail: false,
  },
});

export default chatWebhookQueue;
