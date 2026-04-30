/**
 * Queue Manager
 *
 * Initializes all BullMQ workers, registers maintenance repeat jobs,
 * and runs recovery scans for event-driven schedulers.
 * Provides graceful shutdown for all queues and workers.
 *
 * Usage:
 *   import { initQueues, shutdownQueues } from './queues/queueManager.js';
 *   await initQueues();          // call after DB is connected
 *   await shutdownQueues();      // call on SIGTERM/SIGINT
 */
import { allQueues, announcementQueue } from './index.js';
import { closeSharedConnection, createRedisConnection } from './connection.js';
import { startEmailWorker, getEmailWorker } from '../workers/emailWorker.js';
import { startNotificationWorker, getNotificationWorker } from '../workers/notificationWorker.js';
import { startActivityWorker, getActivityWorker } from '../workers/activityWorker.js';
import { startAnnouncementWorker, getAnnouncementWorker } from '../workers/announcementWorker.js';
import { startCleanupWorker, getCleanupWorker } from '../workers/cleanupWorker.js';
import { startRecurringTaskWorker, getRecurringTaskWorker } from '../workers/recurringTaskWorker.js';
import { startSalesAlertWorker, getSalesAlertWorker } from '../workers/salesAlertWorker.js';
import { startChatWebhookWorker, getChatWebhookWorker } from '../workers/chatWebhookWorker.js';
import { registerMaintenanceJobs } from '../schedulers/maintenanceScheduler.js';
import { recoverAnnouncementSchedules } from '../schedulers/announcementScheduler.js';
import { recoverRecurringSchedules } from '../schedulers/recurringTaskScheduler.js';
import { recoverReminderSchedules } from '../schedulers/reminderScheduler.js';
import logger from '../utils/logger.js';

let _initialized = false;
let _redisAvailable = false;

/**
 * Probe Redis availability without crashing if Redis is down.
 */
async function probeRedis() {
  let probe = null;
  try {
    probe = createRedisConnection({ lazyConnect: true, enableOfflineQueue: false });
    probe.on('error', () => {});
    await probe.connect();
    await Promise.race([
      probe.ping(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Redis probe timeout')), 3000)
      ),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (probe) {
      try { await probe.quit(); } catch { probe.disconnect(); }
    }
  }
}

/**
 * Remove repeatable jobs that no longer have handlers (left over from the
 * polling-based architecture). Dynamically finds them by job name so key
 * format changes across BullMQ versions don't matter.
 */
async function removeStaleRepeatableJobs() {
  const staleNames = new Set(['process-scheduled', 'archive-expired']);
  try {
    const repeatable = await announcementQueue.getRepeatableJobs();
    const toRemove = repeatable.filter(r => staleNames.has(r.name));
    for (const r of toRemove) {
      try {
        await announcementQueue.removeRepeatableByKey(r.key);
        logger.info(`QueueManager: removed stale repeatable "${r.name}" (key: ${r.key})`);
      } catch (err) {
        logger.warn(`QueueManager: failed to remove repeatable "${r.name}": ${err.message}`);
      }
    }
  } catch (err) {
    logger.warn('QueueManager: stale repeatable job cleanup warning (non-fatal)', { error: err.message });
  }
  // Drain already-spawned instances sitting in waiting/delayed/active
  try {
    const jobs = await announcementQueue.getJobs(['waiting', 'delayed', 'active']);
    const stale = jobs.filter(j => staleNames.has(j.name));
    for (const j of stale) {
      try {
        await j.remove();
      } catch {
        // job may be locked/active — ignore
      }
    }
    if (stale.length) {
      logger.info(`QueueManager: drained ${stale.length} stale announcement job instance(s)`);
    }
  } catch (err) {
    logger.warn('QueueManager: stale job drain warning (non-fatal)', { error: err.message });
  }
}

/**
 * Initialize all BullMQ workers, register maintenance jobs, and run recovery scans.
 */
export async function initQueues() {
  if (_initialized) return _redisAvailable;

  _redisAvailable = await probeRedis();

  if (!_redisAvailable) {
    logger.warn('QueueManager: Redis not available — falling back to in-process background tasks');
    _initialized = true;
    return false;
  }

  logger.info('QueueManager: Redis available — starting BullMQ workers');

  // ─── Remove stale repeatable jobs from old polling architecture ───────────
  await removeStaleRepeatableJobs();

  // ─── Start all workers ────────────────────────────────────────────────────
  startEmailWorker();
  startNotificationWorker();
  startActivityWorker();
  startAnnouncementWorker();
  startCleanupWorker();
  startRecurringTaskWorker();
  // Chat webhook worker handles delivery of events to ChatApp
  try {
    startChatWebhookWorker();
    logger.info('QueueManager: chatWebhookWorker started');
  } catch (err) {
    logger.warn('QueueManager: chatWebhookWorker could not start', { error: err.message });
  }

  // SalesAlert worker uses concurrency 1 to minimise Redis connections.
  // Start it with a small delay so core workers connect first.
  setTimeout(() => {
    try {
      startSalesAlertWorker();
      logger.info('QueueManager: salesAlertWorker started (deferred)');
    } catch (err) {
      logger.warn('QueueManager: salesAlertWorker could not start — alerts will be processed on next restart', { error: err.message });
    }
  }, 3000);

  // ─── Register maintenance repeat jobs ─────────────────────────────────────
  await registerMaintenanceJobs();

  // ─── Recovery scans (catch jobs missed during downtime) ───────────────────
  try {
    await Promise.allSettled([
      recoverAnnouncementSchedules(),
      recoverRecurringSchedules(),
      recoverReminderSchedules(),
    ]);
    logger.info('QueueManager: recovery scans complete');
  } catch (err) {
    logger.error('QueueManager: recovery scan error (non-fatal)', { error: err.message });
  }

  _initialized = true;
  logger.info('QueueManager: all workers started, maintenance jobs registered');
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

  logger.info('QueueManager: shutting down workers...');

  const workers = [
    getEmailWorker(),
    getNotificationWorker(),
    getActivityWorker(),
    getAnnouncementWorker(),
    getCleanupWorker(),
    getRecurringTaskWorker(),
    getSalesAlertWorker(),
    getChatWebhookWorker(),
  ].filter(Boolean);

  // Close workers (stop processing new jobs, wait for current)
  await Promise.allSettled(workers.map((w) => w.close()));

  // Close queues
  await Promise.allSettled(allQueues.map((q) => q.close()));

  // Close shared Redis connection
  await closeSharedConnection();

  _initialized = false;
  _redisAvailable = false;
  logger.info('QueueManager: shutdown complete');
}
