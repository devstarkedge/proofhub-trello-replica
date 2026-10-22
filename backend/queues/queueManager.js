/**
 * Queue Manager
 *
 * Initializes production or local workers, registers maintenance repeat jobs,
 * and runs recovery scans for event-driven schedulers.
 * Provides graceful shutdown for all queues and workers.
 *
 * Usage:
 *   import { initQueues, shutdownQueues } from './queues/queueManager.js';
 *   await initQueues();          // call after DB is connected
 *   await shutdownQueues();      // call on SIGTERM/SIGINT
 */
import { allQueues, announcementQueue } from './index.js';
import { closeSharedConnection, connectRedis, withTimeout } from './connection.js';
import config from '../config/index.js';
import { startEmailWorker, getEmailWorker } from '../workers/emailWorker.js';
import { startNotificationWorker, getNotificationWorker } from '../workers/notificationWorker.js';
import { startActivityWorker, getActivityWorker } from '../workers/activityWorker.js';
import { startAnnouncementWorker, getAnnouncementWorker } from '../workers/announcementWorker.js';
import { startCleanupWorker, getCleanupWorker } from '../workers/cleanupWorker.js';
import { startRecurringTaskWorker, getRecurringTaskWorker } from '../workers/recurringTaskWorker.js';
import { startSalesAlertWorker, getSalesAlertWorker } from '../workers/salesAlertWorker.js';
import { startChatWebhookWorker, getChatWebhookWorker } from '../workers/chatWebhookWorker.js';
import { startSlackWorker, getSlackWorker } from '../workers/slackWorker.js';
import { startLeaveWorker, getLeaveWorker } from '../workers/leaveWorker.js';
import { registerMaintenanceJobs } from '../schedulers/maintenanceScheduler.js';
import { registerLeaveMaintenanceJobs } from '../schedulers/leaveMaintenanceScheduler.js';
import { registerAttendanceMaintenanceJobs } from '../schedulers/attendanceMaintenanceScheduler.js';
import { recoverAnnouncementSchedules } from '../schedulers/announcementScheduler.js';
import { recoverRecurringSchedules } from '../schedulers/recurringTaskScheduler.js';
import { recoverReminderSchedules } from '../schedulers/reminderScheduler.js';
import { recoverSlackBatchSchedules } from '../schedulers/slackBatchScheduler.js';
import { recoverSlackDigestSchedules } from '../schedulers/slackDigestScheduler.js';
import { recoverCardDueDateSchedules } from '../schedulers/cardDueDateScheduler.js';
import { recoverLeaveApprovalReminderSchedules } from '../schedulers/leaveReminderScheduler.js';
import logger from '../utils/logger.js';

let _initialized = false;
let _accepting = false;
let _initializing = null;

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
 * Initialize all workers, register maintenance jobs, and run recovery scans.
 */
export async function initQueues() {
  if (_initialized) return config.redis.enabled;
  if (_initializing) return _initializing;
  _initializing = (async () => {
    try {
      await connectRedis();
      _accepting = true;
      // Both backends run the same processors, concurrency limits and schedules.
      const workers = [
        startEmailWorker(), startNotificationWorker(), startActivityWorker(),
        startAnnouncementWorker(), startCleanupWorker(), startRecurringTaskWorker(),
        startSlackWorker(), startLeaveWorker(), startChatWebhookWorker(), startSalesAlertWorker(),
      ];
      await Promise.all(workers.map(worker => withTimeout(worker.waitUntilReady(), config.redis.connectTimeoutMs, 'Job')));
      await removeStaleRepeatableJobs();
      await registerMaintenanceJobs();
      await registerLeaveMaintenanceJobs();
      await registerAttendanceMaintenanceJobs();
      const recovery = await Promise.allSettled([
        recoverAnnouncementSchedules(), recoverRecurringSchedules(), recoverReminderSchedules(),
        recoverSlackBatchSchedules(), recoverSlackDigestSchedules(), recoverCardDueDateSchedules(),
        recoverLeaveApprovalReminderSchedules(),
      ]);
      if (recovery.some(result => result.status === 'rejected')) throw new Error('Job schedule recovery failed');
      _initialized = true;
      logger.info('Job service initialized', { mode: config.redis.enabled ? 'production' : 'local', workers: workers.length });
      return config.redis.enabled;
    } catch (error) {
      await shutdownQueues();
      throw error;
    } finally { _initializing = null; }
  })();
  return _initializing;
}

// Production never switches to best-effort inline delivery after an outage.
export function isQueueActive() {
  return config.redis.enabled || _accepting;
}

export async function shutdownQueues() {
  _accepting = false;
  const workers = [
    getEmailWorker(), getNotificationWorker(), getActivityWorker(), getAnnouncementWorker(),
    getCleanupWorker(), getRecurringTaskWorker(), getSalesAlertWorker(),
    getChatWebhookWorker(), getSlackWorker(), getLeaveWorker(),
  ].filter(Boolean);
  await Promise.allSettled(workers.map(async worker => {
    try { await withTimeout(worker.close(), config.redis.shutdownTimeoutMs, 'Job'); }
    catch { await withTimeout(worker.close(true), config.redis.shutdownTimeoutMs, 'Job').catch(() => {}); }
  }));
  await Promise.allSettled(allQueues.map(queue => queue.close()));
  await closeSharedConnection();
  _initialized = false;
}
