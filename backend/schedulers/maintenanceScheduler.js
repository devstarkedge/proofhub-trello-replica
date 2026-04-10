/**
 * Maintenance Scheduler
 *
 * Registers BullMQ repeatable jobs for all periodic maintenance tasks:
 *   - Queue cleanup (completed/failed jobs from Redis)
 *   - Trash cleanup (soft-deleted attachments after 30 days)
 *   - Archived card cleanup (auto-delete expired archived cards)
 *   - Board cleanup (permanently delete soft-deleted boards)
 *
 * Called once during initQueues(). Repeatable jobs survive restarts;
 * BullMQ deduplicates by jobId so re-registering is safe.
 */
import { cleanupQueue } from '../queues/index.js';
import { allQueues } from '../queues/index.js';

const SIX_HOURS   = 6 * 60 * 60 * 1000;
const EIGHT_HOURS  = 8 * 60 * 60 * 1000;
const ONE_MINUTE   = 60 * 1000;

/**
 * Register all maintenance repeat jobs on the cleanup queue.
 */
export async function registerMaintenanceJobs() {
  // 1. Queue cleanup — purge old completed/failed jobs from Redis every 8h
  await cleanupQueue.add(
    'cleanup-queues',
    {},
    {
      repeat: { every: EIGHT_HOURS },
      jobId: 'repeat:cleanup-queues',
      removeOnComplete: true,
      removeOnFail: { count: 50 },
    }
  );

  // 2. Trash cleanup — permanently delete soft-deleted attachments every 6h
  await cleanupQueue.add(
    'cleanup-trash',
    {},
    {
      repeat: { every: SIX_HOURS },
      jobId: 'repeat:cleanup-trash',
      removeOnComplete: true,
      removeOnFail: { count: 50 },
    }
  );

  // 3. Archived card cleanup — auto-delete expired archived cards every 6h
  await cleanupQueue.add(
    'cleanup-archived-cards',
    {},
    {
      repeat: { every: SIX_HOURS },
      jobId: 'repeat:cleanup-archived-cards',
      removeOnComplete: true,
      removeOnFail: { count: 50 },
    }
  );

  // 4. Board cleanup — permanently delete soft-deleted boards every 60s
  await cleanupQueue.add(
    'cleanup-boards',
    {},
    {
      repeat: { every: ONE_MINUTE },
      jobId: 'repeat:cleanup-boards',
      removeOnComplete: true,
      removeOnFail: { count: 50 },
    }
  );

  // Run trash + archived-cards once immediately on boot
  await cleanupQueue.add('cleanup-trash', {}, { jobId: 'initial-cleanup-trash' });
  await cleanupQueue.add('cleanup-archived-cards', {}, { jobId: 'initial-cleanup-archived' });
  await cleanupQueue.add('cleanup-boards', {}, { jobId: 'initial-cleanup-boards' });
}

/**
 * Clean completed and failed jobs older than 24h from all BullMQ queues.
 * Imported by cleanupWorker for the 'cleanup-queues' handler.
 */
export async function cleanAllQueues() {
  const MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const BATCH_SIZE = 1000;

  for (const queue of allQueues) {
    try {
      const completed = await queue.clean(MAX_AGE_MS, BATCH_SIZE, 'completed');
      const failed    = await queue.clean(MAX_AGE_MS, BATCH_SIZE, 'failed');

      if (completed.length || failed.length) {
        console.log(
          `[Maintenance] ${queue.name}: removed ${completed.length} completed, ${failed.length} failed`
        );
      }
    } catch (err) {
      console.error(`[Maintenance] Error cleaning ${queue.name}:`, err.message);
    }
  }
}
