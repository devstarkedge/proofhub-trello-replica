/**
 * Card Due-Date Scheduler (Event-Driven) — Overdue Alerts / Due Soon Reminders
 *
 * No such logic existed before this — Card.js already had compound indexes
 * ({workspaceId,dueDate,status}, {workspaceId,assignees,dueDate,status})
 * clearly prepared for this, but nothing queried them, and
 * slackHooks.onTaskOverdue/onDeadlineReminder were dead stubs.
 *
 * Follows the same exact-delayed-job pattern as schedulers/reminderScheduler.js:
 * two jobs scheduled at Card create/update time (due-soon at dueDate-24h,
 * overdue at dueDate), rather than a polling scan. Dedup is tracked on the
 * card itself (Card.notificationState.{dueSoonNotifiedAt,overdueNotifiedAt})
 * so the same transition is never re-notified — and is reset whenever the
 * due date changes, so a task pushed to the future and later overdue again
 * becomes eligible for a fresh notification.
 */
import { notificationQueue } from '../queues/index.js';
import { isQueueActive } from '../queues/queueManager.js';
import Card from '../models/Card.js';
import logger from '../utils/logger.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';

const DUE_SOON_LEAD_MS = 24 * 60 * 60 * 1000;

function dueSoonJobId(cardId) {
  return `card-due-soon:${cardId}`;
}

function overdueJobId(cardId) {
  return `card-overdue:${cardId}`;
}

async function removeJob(jobId) {
  try {
    const job = await notificationQueue.getJob(jobId);
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

export function isDoneStatus(status) {
  return status === 'done' || status === 'completed' || status === 'closed';
}

/**
 * Schedule (or reschedule) due-soon/overdue jobs for a card. No-ops if the
 * card has no due date or is already complete/archived.
 */
export async function scheduleDueDateJobs(card) {
  if (!isQueueActive()) return;

  const id = (card._id || card.id).toString();

  if (!card.dueDate || card.isArchived || isDoneStatus(card.status)) {
    return cancelDueDateJobs(id);
  }

  const dueDate = new Date(card.dueDate);
  const now = Date.now();

  await removeJob(dueSoonJobId(id));
  await removeJob(overdueJobId(id));

  const dueSoonDelay = dueDate.getTime() - DUE_SOON_LEAD_MS - now;
  if (dueSoonDelay > 0 && !card.notificationState?.dueSoonNotifiedAt) {
    await notificationQueue.add(
      'process-card-due-soon',
      { cardId: id },
      {
        jobId: dueSoonJobId(id),
        delay: dueSoonDelay,
        removeOnComplete: true,
        removeOnFail: { count: 50 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      }
    );
  }

  const overdueDelay = Math.max(0, dueDate.getTime() - now);
  if (!card.notificationState?.overdueNotifiedAt) {
    await notificationQueue.add(
      'process-card-overdue',
      { cardId: id },
      {
        jobId: overdueJobId(id),
        delay: overdueDelay,
        removeOnComplete: true,
        removeOnFail: { count: 50 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      }
    );
  }
}

/**
 * Cancel pending due-soon/overdue jobs (on completion, delete, or due date cleared).
 */
export async function cancelDueDateJobs(cardId) {
  if (!isQueueActive()) return;
  const id = cardId.toString();
  await Promise.allSettled([removeJob(dueSoonJobId(id)), removeJob(overdueJobId(id))]);
}

/**
 * Recovery: on startup, (re)schedule due-soon/overdue jobs for every
 * incomplete card with a due date. Idempotent via deterministic jobIds and
 * the notificationState dedup guard (a card already past its overdue
 * moment with overdueNotifiedAt unset gets an immediate/near-immediate job,
 * not a duplicate of one already delivered).
 */
export async function recoverCardDueDateSchedules() {
  if (!isQueueActive()) return;

  let recovered = 0;

  // Runs at boot, outside any request — a deliberate cross-tenant scan
  // (recovering due jobs for every workspace), not a leak.
  const cards = await workspaceContext.runUnscoped(async () => Card.find({
    dueDate: { $ne: null },
    isArchived: { $ne: true },
    status: { $nin: ['done', 'completed', 'closed'] },
  }).select('_id dueDate isArchived status notificationState').lean());

  for (const card of cards) {
    await scheduleDueDateJobs(card);
    recovered++;
  }

  if (recovered > 0) {
    logger.info(`[Scheduler:CardDueDate] recovered ${recovered} card schedules on startup`);
  }
}
