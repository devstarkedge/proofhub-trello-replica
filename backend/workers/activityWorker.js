/**
 * Activity Worker
 * 
 * Processes jobs from the 'flowtask:activity' queue.
 * Job types: log-activity
 */
import { Worker } from 'bullmq';
import { getWorkerConnection } from '../queues/connection.js';
import config from '../config/index.js';

const JOB_HANDLERS = {
  /**
   * Log an activity to the Activity collection.
   * Data: activity document fields (board, card, user, action, details, etc.)
   */
  async 'log-activity'(job) {
    // Dynamic import to avoid circular deps at module load time
    const Activity = (await import('../models/Activity.js')).default;
    await Activity.create(job.data);
    return { logged: true };
  },
};

// ─── Worker Creation ──────────────────────────────────────────────────────────

let activityWorker = null;

export function startActivityWorker() {
  activityWorker = new Worker(
    'flowtask.activity',
    async (job) => {
      const handler = JOB_HANDLERS[job.name];
      if (!handler) {
        throw new Error(`Unknown activity job type: ${job.name}`);
      }
      return handler(job);
    },
    {
      connection: getWorkerConnection(),
      concurrency: config.queues.analytics.concurrency, // reuse analytics concurrency
    }
  );

  activityWorker.on('completed', (job, result) => {
    if (config.isDev) console.log(`[ActivityWorker] Job ${job.id} completed`);
  });

  activityWorker.on('failed', (job, err) => {
    console.error(`[ActivityWorker] Job ${job?.id} failed:`, err.message);
  });

  console.log('[ActivityWorker] Started');
  return activityWorker;
}

export function getActivityWorker() {
  return activityWorker;
}
