/**
 * Cleanup Worker
 *
 * Processes all maintenance / cleanup jobs from the 'flowtask.cleanup' queue:
 *   - cleanup-trash           : permanently delete soft-deleted attachments (30+ days)
 *   - cleanup-archived-cards  : auto-delete archived cards past their deadline
 *   - cleanup-boards          : permanently delete soft-deleted boards
 *   - cleanup-queues          : purge old completed/failed BullMQ jobs from Redis
 */
import { Worker } from 'bullmq';
import { getWorkerConnection } from '../queues/connection.js';
import { cleanupTrashedAttachments } from '../utils/trashCleanup.js';
import { cleanupExpiredArchivedCards } from '../utils/archiveCleanup.js';
import { cleanupSoftDeletedBoards } from '../utils/boardCleanup.js';
import { cleanAllQueues } from '../schedulers/maintenanceScheduler.js';
import config from '../config/index.js';

const JOB_HANDLERS = {
  /**
   * Permanently delete attachments that have been in trash for 30+ days.
   */
  async 'cleanup-trash'(_job) {
    await cleanupTrashedAttachments();
    return { status: 'ok' };
  },

  /**
   * Auto-delete archived cards that passed their autoDeleteAt deadline.
   */
  async 'cleanup-archived-cards'(_job) {
    await cleanupExpiredArchivedCards();
    return { status: 'ok' };
  },

  /**
   * Permanently delete soft-deleted boards (and all related data).
   */
  async 'cleanup-boards'(_job) {
    await cleanupSoftDeletedBoards();
    return { status: 'ok' };
  },

  /**
   * Purge old completed/failed jobs from all BullMQ queues (Redis memory).
   */
  async 'cleanup-queues'(_job) {
    await cleanAllQueues();
    return { status: 'ok' };
  },
};

// ─── Worker Creation ──────────────────────────────────────────────────────────

let cleanupWorker = null;

export function startCleanupWorker() {
  cleanupWorker = new Worker(
    'flowtask.cleanup',
    async (job) => {
      const handler = JOB_HANDLERS[job.name];
      if (!handler) {
        throw new Error(`Unknown cleanup job type: ${job.name}`);
      }
      return handler(job);
    },
    {
      connection: getWorkerConnection(),
      concurrency: 1,
    }
  );

  cleanupWorker.on('completed', (job, result) => {
    if (config.isDev) console.log(`[Worker:Cleanup] ${job.name}:${job.id} completed:`, result);
  });

  cleanupWorker.on('failed', (job, err) => {
    console.error(`[Worker:Cleanup] ${job?.name}:${job?.id} failed:`, err.message);
  });

  console.log('[Worker:Cleanup] started');
  return cleanupWorker;
}

export function getCleanupWorker() {
  return cleanupWorker;
}
