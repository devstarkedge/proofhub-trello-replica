/**
 * Reminder Scheduler (Event-Driven)
 *
 * Instead of polling every 15 minutes for due reminders, this module
 * schedules exact delayed BullMQ jobs when reminders are created/updated.
 *
 * - Notification job: fires 24 hours before scheduledDate
 * - Overdue job:      fires 24 hours after scheduledDate (marks as missed)
 *
 * For recurring reminders (every-3-days, weekly, custom), the worker
 * chains the next occurrence after processing.
 */
import { notificationQueue } from '../queues/index.js';
import { isQueueActive } from '../queues/queueManager.js';
import Reminder from '../models/Reminder.js';
import logger from '../utils/logger.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function notifyJobId(reminderId) {
  return `reminder-notify:${reminderId}`;
}

function overdueJobId(reminderId) {
  return `reminder-overdue:${reminderId}`;
}

async function removeJob(queue, jobId) {
  try {
    const job = await queue.getJob(jobId);
    if (job) {
      const state = await job.getState();
      if (state === 'waiting' || state === 'delayed') {
        await job.remove();
      }
    }
  } catch {
    // Safe to ignore
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Schedule a notification job 24 hours before the reminder's scheduledDate,
 * and an overdue check 24 hours after.
 */
export async function scheduleReminderJobs(reminder) {
  if (!isQueueActive()) return;

  const id = (reminder._id || reminder.id).toString();
  const scheduledDate = new Date(reminder.scheduledDate);
  const now = Date.now();

  // Notification: 24 hours before due
  const notifyAt = scheduledDate.getTime() - 24 * 60 * 60 * 1000;
  const notifyDelay = Math.max(0, notifyAt - now);

  await removeJob(notificationQueue, notifyJobId(id));
  await notificationQueue.add(
    'process-reminder-notification',
    { reminderId: id },
    {
      jobId: notifyJobId(id),
      delay: notifyDelay,
      removeOnComplete: true,
      removeOnFail: { count: 50 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    }
  );

  // Overdue check: 24 hours after due
  const overdueAt = scheduledDate.getTime() + 24 * 60 * 60 * 1000;
  const overdueDelay = Math.max(0, overdueAt - now);

  await removeJob(notificationQueue, overdueJobId(id));
  await notificationQueue.add(
    'process-reminder-overdue',
    { reminderId: id },
    {
      jobId: overdueJobId(id),
      delay: overdueDelay,
      removeOnComplete: true,
      removeOnFail: { count: 50 },
    }
  );
}

/**
 * Cancel all pending jobs for a reminder (on delete or complete).
 */
export async function cancelReminderJobs(reminderId) {
  if (!isQueueActive()) return;

  const id = typeof reminderId === 'string' ? reminderId : reminderId.toString();

  await Promise.allSettled([
    removeJob(notificationQueue, notifyJobId(id)),
    removeJob(notificationQueue, overdueJobId(id)),
  ]);
}

/**
 * Recovery: on startup, find all pending reminders and schedule jobs.
 */
export async function recoverReminderSchedules() {
  if (!isQueueActive()) return;

  const now = new Date();
  let recovered = 0;

  // Pending reminders that haven't been notified yet
  const pendingReminders = await Reminder.find({
    status: 'pending',
  }).select('_id scheduledDate').lean();

  for (const reminder of pendingReminders) {
    await scheduleReminderJobs(reminder);
    recovered++;
  }

  if (recovered > 0) {
    logger.info(`[Scheduler:Reminder] recovered ${recovered} jobs on startup`);
  }
}
