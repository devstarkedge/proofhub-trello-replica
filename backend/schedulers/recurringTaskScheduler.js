/**
 * Recurring Task Scheduler (Event-Driven)
 *
 * Instead of polling the DB every 60 seconds for due recurring tasks,
 * this module schedules ONE delayed BullMQ job per recurring task at
 * the exact `nextOccurrence` time. After each job fires and generates
 * the subtask, the worker calls `scheduleNextOccurrence()` to chain
 * the next delayed job.
 *
 * For completion-triggered recurrences (whenComplete, whenDone, daysAfter),
 * no pre-scheduled job is created. Instead, the subtask completion handler
 * enqueues a job on demand.
 */
import { recurringTaskQueue } from '../queues/index.js';
import { isQueueActive } from '../queues/queueManager.js';
import RecurringTask from '../models/RecurringTask.js';
import logger from '../utils/logger.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function occurrenceJobId(recurringTaskId, nextOccurrence) {
  const ts = nextOccurrence instanceof Date ? nextOccurrence.toISOString() : nextOccurrence;
  return `recur:${recurringTaskId}:${ts}`;
}

/**
 * Generic job-id prefix for a recurring task (for removal when we don't know the exact ts).
 */
function recurJobPrefix(recurringTaskId) {
  return `recur:${recurringTaskId}:`;
}

/**
 * Remove any pending delayed job for a recurring task.
 * Since we don't always know the exact timestamp, scan delayed jobs.
 */
async function removePendingRecurringJob(recurringTaskId) {
  try {
    const delayed = await recurringTaskQueue.getDelayed();
    const prefix = recurJobPrefix(recurringTaskId.toString());
    for (const job of delayed) {
      if (job.id && job.id.startsWith(prefix)) {
        await job.remove();
        return;
      }
    }
  } catch {
    // Safe to ignore — job may not exist or already completed
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Schedule the next occurrence for a recurring task as a delayed BullMQ job.
 * Only for `onSchedule` behavior. Completion-triggered recurrences are handled
 * by `enqueueCompletionTriggered()`.
 */
export async function scheduleNextOccurrence(recurringTask) {
  if (!isQueueActive()) return;
  if (!recurringTask.isActive) return;
  if (!recurringTask.nextOccurrence) return;

  // Only pre-schedule onSchedule behavior (not completion-triggered)
  if (recurringTask.recurBehavior !== 'onSchedule') return;

  const id = recurringTask._id.toString();
  const next = new Date(recurringTask.nextOccurrence);
  const delay = Math.max(0, next.getTime() - Date.now());

  // Remove any existing delayed job first
  await removePendingRecurringJob(id);

  const jobId = occurrenceJobId(id, next);

  await recurringTaskQueue.add(
    'generate-task-instance',
    { recurringTaskId: id },
    {
      jobId,
      delay,
      removeOnComplete: true,
      removeOnFail: { count: 50 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    }
  );

  if (delay > 0) {
    logger.info(`[Scheduler:RecurringTask] scheduled ${id} in ${Math.round(delay / 1000)}s`);
  }
}

/**
 * Enqueue a job for completion-triggered recurrences (whenComplete, whenDone, daysAfter).
 * Called from the subtask completion handler.
 * @param {string} recurringTaskId
 * @param {number} delayMs - 0 for immediate (whenComplete/whenDone), N days in ms for daysAfter
 */
export async function enqueueCompletionTriggered(recurringTaskId, delayMs = 0) {
  if (!isQueueActive()) return;

  const id = recurringTaskId.toString();
  const jobId = `recur-completion:${id}:${Date.now()}`;

  await recurringTaskQueue.add(
    'generate-task-instance',
    { recurringTaskId: id },
    {
      jobId,
      delay: Math.max(0, delayMs),
      removeOnComplete: true,
      removeOnFail: { count: 50 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    }
  );
}

/**
 * Cancel pending delayed jobs for a recurring task (on delete/pause/deactivate).
 */
export async function cancelRecurringSchedule(recurringTaskId) {
  if (!isQueueActive()) return;

  await removePendingRecurringJob(recurringTaskId);
  logger.info(`[Scheduler:RecurringTask] cancelled schedule for ${recurringTaskId}`);
}

/**
 * Reschedule a recurring task (e.g. after update changes schedule params).
 */
export async function rescheduleOccurrence(recurringTask) {
  await cancelRecurringSchedule(recurringTask._id);
  await scheduleNextOccurrence(recurringTask);
}

/**
 * Recovery: on startup, find all active onSchedule recurring tasks
 * and ensure each has a delayed job queued.
 */
export async function recoverRecurringSchedules() {
  if (!isQueueActive()) return;

  const now = new Date();
  let recovered = 0;

  // Active onSchedule tasks with future nextOccurrence
  const futureTasks = await RecurringTask.find({
    isActive: true,
    recurBehavior: 'onSchedule',
    nextOccurrence: { $gt: now },
    scheduleType: { $ne: 'daysAfter' },
  }).select('_id nextOccurrence recurBehavior').lean();

  for (const task of futureTasks) {
    await scheduleNextOccurrence(task);
    recovered++;
  }

  // Overdue tasks (nextOccurrence already passed — fire immediately)
  const overdueTasks = await RecurringTask.find({
    isActive: true,
    recurBehavior: 'onSchedule',
    nextOccurrence: { $lte: now },
    scheduleType: { $ne: 'daysAfter' },
  }).select('_id nextOccurrence recurBehavior').lean();

  for (const task of overdueTasks) {
    const id = task._id.toString();
    await recurringTaskQueue.add(
      'generate-task-instance',
      { recurringTaskId: id },
      {
        jobId: `recur-recovery:${id}`,
        delay: 0,
        removeOnComplete: true,
        removeOnFail: { count: 50 },
      }
    );
    recovered++;
  }

  if (recovered > 0) {
    logger.info(`[Scheduler:RecurringTask] recovered ${recovered} jobs on startup`);
  }
}
