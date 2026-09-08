/**
 * Slack Quiet-Hours & Batch-Window Flush Scheduler (Event-Driven)
 *
 * SlackUser.pendingBatch is already durable (a real Mongo field) — the gap
 * this module closes is that nothing previously scheduled a *future* flush
 * of it: SlackNotificationService.addToBatch()/handleQuietHoursNotification()
 * pushed items onto pendingBatch and relied on the next notification to
 * re-check "has enough time passed?", so a user who muted mid-quiet-hours
 * and received no further notifications would never get their batch
 * flushed. This schedules exact-delayed BullMQ jobs (on the previously
 * declared-but-unused `slackQueue`) so a flush always fires even with no
 * further activity, following the same pattern as
 * schedulers/reminderScheduler.js.
 *
 * The immediate-send path (SlackNotificationQueue.js's in-memory queue)
 * is untouched — only the scheduling of *future* flushes is durable.
 */
import { slackQueue } from '../queues/index.js';
import { isQueueActive } from '../queues/queueManager.js';
import SlackUser from '../models/SlackUser.js';
import logger from '../utils/logger.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';

function quietHoursFlushJobId(slackUserId) {
  return `slack-quiet-flush:${slackUserId}`;
}

function batchFlushJobId(slackUserId) {
  return `slack-batch-flush:${slackUserId}`;
}

async function removeJob(jobId) {
  try {
    const job = await slackQueue.getJob(jobId);
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

/**
 * Delay (ms) until the end of the user's configured quiet hours, in their
 * Slack-reported timezone. Reuses the same "render via toLocaleString and
 * read back with local getters" technique as SlackUser.isInQuietHours(),
 * for consistency (see slackDigestScheduler.js's header comment for the
 * same rationale/limitation note re: DST).
 */
export function msUntilQuietHoursEnd(slackUser) {
  const { quietHoursEnd = '08:00' } = slackUser.preferences;
  const timezone = slackUser.slackTimezone || 'UTC';
  const now = new Date();
  const zonedNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const offsetMs = zonedNow.getTime() - now.getTime();

  const [endH, endM] = quietHoursEnd.split(':').map(Number);
  let end = new Date(zonedNow.getFullYear(), zonedNow.getMonth(), zonedNow.getDate(), endH || 0, endM || 0, 0, 0);
  if (end <= zonedNow) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }

  const realEndMs = end.getTime() - offsetMs;
  return Math.max(0, realEndMs - now.getTime());
}

export async function scheduleQuietHoursFlush(slackUser) {
  if (!isQueueActive()) return;

  const jobId = quietHoursFlushJobId(slackUser._id);
  await removeJob(jobId);

  const delay = msUntilQuietHoursEnd(slackUser);

  await slackQueue.add(
    'flush-quiet-hours-batch',
    { slackUserId: slackUser._id.toString(), workspaceId: slackUser.workspaceId?.toString() },
    {
      jobId,
      delay,
      removeOnComplete: true,
      removeOnFail: { count: 50 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    }
  );
}

export async function scheduleBatchFlush(slackUser, workspace) {
  if (!isQueueActive()) return;

  const jobId = batchFlushJobId(slackUser._id);
  await removeJob(jobId);

  const intervalMinutes = workspace?.settings?.batchIntervalMinutes
    || slackUser.preferences?.batchIntervalMinutes
    || 5;

  await slackQueue.add(
    'flush-scheduled-batch',
    { slackUserId: slackUser._id.toString(), workspaceId: slackUser.workspaceId?.toString() },
    {
      jobId,
      delay: intervalMinutes * 60 * 1000,
      removeOnComplete: true,
      removeOnFail: { count: 50 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    }
  );
}

/**
 * Recovery: on startup, re-arm a flush for every user left with a
 * non-empty pendingBatch (covers a crash/restart between queueing an item
 * and the scheduled flush firing).
 */
export async function recoverSlackBatchSchedules() {
  if (!isQueueActive()) return;

  let recovered = 0;

  const users = await workspaceContext.runUnscoped(async () => SlackUser.find({
    isActive: true,
    'pendingBatch.0': { $exists: true },
  }).select('_id workspaceId preferences slackTimezone').lean());

  for (const user of users) {
    if (user.preferences?.quietHoursEnabled) {
      await scheduleQuietHoursFlush({ _id: user._id, workspaceId: user.workspaceId, preferences: user.preferences, slackTimezone: user.slackTimezone });
    } else {
      await scheduleBatchFlush({ _id: user._id, workspaceId: user.workspaceId, preferences: user.preferences }, null);
    }
    recovered++;
  }

  if (recovered > 0) {
    logger.info(`[Scheduler:SlackBatch] recovered ${recovered} pending-batch flush jobs on startup`);
  }
}
