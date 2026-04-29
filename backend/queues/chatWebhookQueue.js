import { Queue } from 'bullmq';
import { getSharedConnection } from './connection.js';

const chatWebhookQueue = new Queue('chat-webhooks', {
  connection: getSharedConnection(),
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export default chatWebhookQueue;
