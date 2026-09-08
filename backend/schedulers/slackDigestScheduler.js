/**
 * Slack Digest Scheduler (Event-Driven)
 *
 * Per-(user, FlowTask workspace) recurring Slack digest, following the same
 * exact-delayed-job pattern as schedulers/reminderScheduler.js rather than a
 * BullMQ repeatable/cron registration — each user has an individual
 * digestTime/digestDay/timezone, so a shared cron pattern would need the
 * same remove-and-re-add-on-preference-change dance a chained delayed job
 * needs anyway, and chaining naturally re-reads the latest preferences at
 * fire time (see workers/slackWorker.js's 'send-slack-digest' handler,
 * which re-verifies digestEnabled before sending and re-schedules the next
 * occurrence after).
 *
 * Timezone handling deliberately reuses the same "render via
 * toLocaleString(timeZone) and read back with local getters" technique
 * already used by SlackUser.isInQuietHours(), rather than introducing a
 * separate timezone library/approach for notifications. This is accurate
 * for the common case; a job scheduled far enough ahead to cross a DST
 * transition in the target zone may fire up to ~1 hour off, which is an
 * accepted limitation consistent with the rest of the codebase's
 * timezone handling (no timezone library is currently a dependency).
 */
import { slackQueue } from '../queues/index.js';
import { isQueueActive } from '../queues/queueManager.js';
import SlackUser from '../models/SlackUser.js';
import logger from '../utils/logger.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function digestJobId(userId, workspaceId) {
  return `digest:${userId}:${workspaceId}`;
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
 * Computes the delay (ms) until the next digest fire time, given the
 * user's preferences and Slack-reported timezone.
 */
export function computeNextDigestDelay({ digestTime = '09:00', digestDay = 'monday', digestFrequency = 'daily' }, timezone = 'UTC') {
  const now = new Date();
  const zonedNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const offsetMs = zonedNow.getTime() - now.getTime();

  const [hh, mm] = digestTime.split(':').map(Number);
  let target = new Date(zonedNow.getFullYear(), zonedNow.getMonth(), zonedNow.getDate(), hh || 0, mm || 0, 0, 0);

  if (digestFrequency === 'weekly') {
    const targetDayIndex = WEEKDAYS.indexOf((digestDay || 'monday').toLowerCase());
    const currentDayIndex = target.getDay();
    let diffDays = (targetDayIndex - currentDayIndex + 7) % 7;
    target = new Date(target.getFullYear(), target.getMonth(), target.getDate() + diffDays, hh || 0, mm || 0, 0, 0);
    if (target <= zonedNow) {
      target = new Date(target.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
  } else if (digestFrequency === 'hourly') {
    target = new Date(zonedNow.getTime() + 60 * 60 * 1000);
  } else {
    // daily (default)
    if (target <= zonedNow) {
      target = new Date(target.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  const realTargetMs = target.getTime() - offsetMs;
  return Math.max(0, realTargetMs - now.getTime());
}

/**
 * Schedule (or reschedule) a user's digest job based on their current
 * SlackUser preferences. Cancels the job if the digest is disabled.
 */
export async function scheduleDigestJob(slackUserId, workspaceId) {
  if (!isQueueActive()) return;

  const slackUser = await SlackUser.findById(slackUserId).select('user workspaceId preferences slackTimezone isActive');
  if (!slackUser || !slackUser.isActive) return cancelDigestJob(slackUserId, workspaceId);

  const { digestEnabled, digestFrequency } = slackUser.preferences;
  if (!digestEnabled || !digestFrequency || digestFrequency === 'never') {
    return cancelDigestJob(slackUserId, workspaceId);
  }

  const jobId = digestJobId(slackUserId, workspaceId);
  await removeJob(jobId);

  const delay = computeNextDigestDelay(slackUser.preferences, slackUser.slackTimezone || 'UTC');

  await slackQueue.add(
    'send-slack-digest',
    { slackUserId: slackUserId.toString(), workspaceId: workspaceId.toString(), period: digestFrequency },
    {
      jobId,
      delay,
      removeOnComplete: true,
      removeOnFail: { count: 50 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    }
  );

  logger.info(`[Scheduler:SlackDigest] scheduled ${jobId} in ${Math.round(delay / 1000)}s`);
}

/**
 * Cancel a user's pending digest job (on disconnect, or digest disabled).
 */
export async function cancelDigestJob(slackUserId, workspaceId) {
  if (!isQueueActive()) return;
  await removeJob(digestJobId(slackUserId, workspaceId));
}

/**
 * Recovery: on startup, (re)schedule digest jobs for every active,
 * digest-enabled SlackUser. Idempotent via the deterministic jobId.
 */
export async function recoverSlackDigestSchedules() {
  if (!isQueueActive()) return;

  let recovered = 0;

  const users = await workspaceContext.runUnscoped(async () => SlackUser.find({
    isActive: true,
    'preferences.digestEnabled': true,
    'preferences.digestFrequency': { $nin: ['never', null] },
    workspaceId: { $ne: null },
  }).select('_id workspaceId').lean());

  for (const user of users) {
    await scheduleDigestJob(user._id, user.workspaceId);
    recovered++;
  }

  if (recovered > 0) {
    logger.info(`[Scheduler:SlackDigest] recovered ${recovered} jobs on startup`);
  }
}
