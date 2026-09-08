/**
 * Slack Worker
 *
 * Processes durable, scheduled jobs from the 'flowtask.slack' queue
 * (previously declared in queues/index.js but never consumed — see
 * schedulers/slackBatchScheduler.js and slackDigestScheduler.js for what
 * schedules these). The immediate-send path (SlackNotificationQueue.js's
 * in-memory queue, used by SlackNotificationService.sendNotification) is
 * untouched — this worker only handles the *deferred* cases that need to
 * survive a process restart: quiet-hours flush, batch-window flush, and
 * per-user digest delivery.
 *
 * Job types: flush-quiet-hours-batch, flush-scheduled-batch, send-slack-digest
 */
import { Worker } from 'bullmq';
import { getWorkerConnection } from '../queues/connection.js';
import config from '../config/index.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import SlackUser from '../models/SlackUser.js';
import { processBatch, processDigest } from '../services/slack/index.js';
import { scheduleDigestJob } from '../schedulers/slackDigestScheduler.js';
import { scheduleQuietHoursFlush, scheduleBatchFlush } from '../schedulers/slackBatchScheduler.js';

const JOB_HANDLERS = {
  /**
   * Flush a user's pending batch that was deferred by Quiet Hours.
   * Data: { slackUserId, workspaceId }
   */
  async 'flush-quiet-hours-batch'(job) {
    const { slackUserId } = job.data;

    const slackUser = await SlackUser.findById(slackUserId);
    if (!slackUser || !slackUser.isActive) {
      return { skipped: true, reason: 'user_inactive' };
    }

    // Re-check at fire time — the user may have changed their quiet-hours
    // window since this was scheduled.
    if (slackUser.isInQuietHours()) {
      await scheduleQuietHoursFlush(slackUser);
      return { skipped: true, reason: 'still_in_quiet_hours', rescheduled: true };
    }

    if (slackUser.pendingBatch.length === 0) {
      return { skipped: true, reason: 'nothing_pending' };
    }

    const result = await processBatch({ slackUserId: slackUser._id.toString(), workspaceId: slackUser.workspace?.toString() });
    return result;
  },

  /**
   * Flush a user's pending batch at the end of the normal batching window.
   * Data: { slackUserId, workspaceId }
   */
  async 'flush-scheduled-batch'(job) {
    const { slackUserId } = job.data;

    const slackUser = await SlackUser.findById(slackUserId);
    if (!slackUser || !slackUser.isActive) {
      return { skipped: true, reason: 'user_inactive' };
    }

    if (slackUser.pendingBatch.length === 0) {
      return { skipped: true, reason: 'nothing_pending' };
    }

    // Non-critical batched notifications should still respect quiet hours
    // if the window started after they were queued.
    if (slackUser.isInQuietHours()) {
      await scheduleQuietHoursFlush(slackUser);
      return { skipped: true, reason: 'entered_quiet_hours', rescheduled: true };
    }

    const result = await processBatch({ slackUserId: slackUser._id.toString(), workspaceId: slackUser.workspace?.toString() });
    return result;
  },

  /**
   * Deliver a user's scheduled digest, then chain the next occurrence.
   * Data: { slackUserId, workspaceId, period }
   */
  async 'send-slack-digest'(job) {
    const { slackUserId, workspaceId, period } = job.data;

    const slackUser = await SlackUser.findById(slackUserId).select('isActive preferences workspaceId');
    if (!slackUser || !slackUser.isActive) {
      return { skipped: true, reason: 'user_inactive' };
    }

    // Re-verify at fire time — preferences may have changed since this was
    // scheduled (digest turned off, frequency/time changed).
    if (!slackUser.preferences.digestEnabled || slackUser.preferences.digestFrequency === 'never') {
      return { skipped: true, reason: 'digest_disabled' };
    }

    let result = { skipped: true, reason: 'no_result' };
    try {
      result = await processDigest({ slackUserId, period: slackUser.preferences.digestFrequency || period });
    } finally {
      // Chain the next occurrence regardless of delivery outcome, so a
      // transient failure doesn't silently end the user's recurring digest.
      await scheduleDigestJob(slackUserId, workspaceId);
    }
    return result;
  },
};

let slackWorker = null;

export function startSlackWorker() {
  slackWorker = new Worker(
    'flowtask.slack',
    async (job) => {
      const handler = JOB_HANDLERS[job.name];
      if (!handler) {
        throw new Error(`Unknown slack job type: ${job.name}`);
      }
      if (job.data?.workspaceId) {
        return workspaceContext.run({ workspaceId: job.data.workspaceId }, () => handler(job));
      }
      return handler(job);
    },
    {
      connection: getWorkerConnection(),
      concurrency: config.queues.slack.concurrency,
    }
  );

  slackWorker.on('failed', (job, err) => {
    console.error(`[Worker:Slack] ${job?.name}:${job?.id} failed: ${err.message}`);
  });

  console.log('[Worker:Slack] started');
  return slackWorker;
}

export function getSlackWorker() {
  return slackWorker;
}
