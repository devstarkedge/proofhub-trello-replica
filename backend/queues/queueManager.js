/**
 * Queue Manager
 * 
 * Initializes all BullMQ workers and sets up repeatable (cron-like) jobs.
 * Provides graceful shutdown for all queues and workers.
 * 
 * Usage:
 *   import { initQueues, shutdownQueues } from './queues/queueManager.js';
 *   await initQueues();          // call after DB is connected
 *   await shutdownQueues();      // call on SIGTERM/SIGINT
 */
import { announcementQueue, cleanupQueue, allQueues } from './index.js';
import { closeSharedConnection, createRedisConnection } from './connection.js';
import { startEmailWorker, getEmailWorker } from '../workers/emailWorker.js';
import { startNotificationWorker, getNotificationWorker } from '../workers/notificationWorker.js';
import { startActivityWorker, getActivityWorker } from '../workers/activityWorker.js';
import { startAnnouncementWorker, getAnnouncementWorker } from '../workers/announcementWorker.js';
import { startCleanupWorker, getCleanupWorker } from '../workers/cleanupWorker.js';

let _initialized = false;
let _redisAvailable = false;

/**
 * Probe Redis availability without crashing if Redis is down.
 * Returns true if Redis is reachable, false otherwise.
 */
async function probeRedis() {
  try {
    const conn = createRedisConnection();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        conn.disconnect();
        reject(new Error('Redis connection timeout'));
      }, 3000);
      conn.on('ready', () => {
        clearTimeout(timeout);
        resolve();
      });
      conn.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    await conn.quit();
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize all BullMQ workers and set up repeatable jobs.
 * Falls back gracefully to setImmediate-based tasks if Redis is unavailable.
 */
export async function initQueues() {
  if (_initialized) return _redisAvailable;

  _redisAvailable = await probeRedis();

  if (!_redisAvailable) {
    console.warn('[QueueManager] Redis not available — falling back to in-process background tasks');
    _initialized = true;
    return false;
  }

  console.log('[QueueManager] Redis available — starting BullMQ workers');

  // Start all workers
  startEmailWorker();
  startNotificationWorker();
  startActivityWorker();
  startAnnouncementWorker();
  startCleanupWorker();

  // ─── Repeatable Jobs ────────────────────────────────────────────────────────
  // These replace the setInterval calls in backgroundTasks.js

  // Process scheduled announcements every 30 seconds
  await announcementQueue.add(
    'process-scheduled',
    {},
    {
      repeat: { every: 30_000 },
      jobId: 'repeat:process-scheduled',
      removeOnComplete: true,
      removeOnFail: { count: 100 },
    }
  );

  // Archive expired announcements every 5 minutes
  await announcementQueue.add(
    'archive-expired',
    {},
    {
      repeat: { every: 300_000 },
      jobId: 'repeat:archive-expired',
      removeOnComplete: true,
      removeOnFail: { count: 100 },
    }
  );

  // Trash cleanup every 6 hours
  await cleanupQueue.add(
    'cleanup-trash',
    {},
    {
      repeat: { every: 6 * 60 * 60 * 1000 },
      jobId: 'repeat:cleanup-trash',
      removeOnComplete: true,
      removeOnFail: { count: 50 },
    }
  );

  // Run cleanup once immediately
  await cleanupQueue.add('cleanup-trash', {}, { jobId: 'initial-cleanup' });

  _initialized = true;
  console.log('[QueueManager] All workers started, repeatable jobs registered');
  return true;
}

/**
 * Check if BullMQ queues are active (Redis was available at startup).
 */
export function isQueueActive() {
  return _redisAvailable;
}

/**
 * Gracefully shut down all workers and close connections.
 */
export async function shutdownQueues() {
  if (!_initialized || !_redisAvailable) return;

  console.log('[QueueManager] Shutting down workers...');

  const workers = [
    getEmailWorker(),
    getNotificationWorker(),
    getActivityWorker(),
    getAnnouncementWorker(),
    getCleanupWorker(),
  ].filter(Boolean);

  // Close workers (stop processing new jobs, wait for current)
  await Promise.allSettled(workers.map((w) => w.close()));

  // Close queues
  await Promise.allSettled(allQueues.map((q) => q.close()));

  // Close shared Redis connection
  await closeSharedConnection();

  _initialized = false;
  _redisAvailable = false;
  console.log('[QueueManager] Shutdown complete');
}
