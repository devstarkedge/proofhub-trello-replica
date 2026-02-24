/**
 * Queue Cleanup Scheduler
 *
 * Periodically removes completed and failed jobs older than 24 hours
 * from every registered BullMQ queue. Keeps Redis memory stable on
 * constrained plans (e.g. Redis Cloud FREE 30 MB).
 *
 * Usage:
 *   import { startQueueCleanupScheduler, stopQueueCleanupScheduler } from './queueCleanup.js';
 *   startQueueCleanupScheduler();   // call after workers are started
 *   stopQueueCleanupScheduler();    // call on graceful shutdown
 */
import { allQueues } from './index.js';

const CLEANUP_INTERVAL_MS = 8 * 60 * 60 * 1000; // 8 hours
const MAX_AGE_MS = 24 * 60 * 60 * 1000;          // 24 hours
const BATCH_SIZE = 1000;

let _intervalId = null;

/**
 * Clean completed and failed jobs older than MAX_AGE_MS from all queues.
 */
export async function cleanAllQueues() {
  for (const queue of allQueues) {
    try {
      const completed = await queue.clean(MAX_AGE_MS, BATCH_SIZE, 'completed');
      const failed    = await queue.clean(MAX_AGE_MS, BATCH_SIZE, 'failed');

      if (completed.length || failed.length) {
        console.log(
          `[QueueCleanup] ${queue.name}: removed ${completed.length} completed, ${failed.length} failed`
        );
      }
    } catch (err) {
      console.error(`[QueueCleanup] Error cleaning ${queue.name}:`, err.message);
    }
  }
}

/**
 * Start periodic queue cleanup (every 8 hours).
 * Also runs an initial cleanup immediately.
 */
export function startQueueCleanupScheduler() {
  if (_intervalId) return; // already running

  // Initial cleanup on startup
  cleanAllQueues().catch(() => {});

  _intervalId = setInterval(() => {
    cleanAllQueues().catch(() => {});
  }, CLEANUP_INTERVAL_MS);

  console.log('[BullMQ] Auto cleanup enabled (Redis-safe mode)');
}

/**
 * Stop periodic queue cleanup (call during graceful shutdown).
 */
export function stopQueueCleanupScheduler() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}
