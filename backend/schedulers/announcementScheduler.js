/**
 * Announcement Scheduler (Event-Driven)
 *
 * Instead of polling every 30 seconds, this module schedules exact delayed
 * BullMQ jobs when announcements are created/updated/deleted.
 *
 * - Broadcast job: fires at the exact `scheduledFor` time
 * - Archive job:   fires at the exact `expiresAt` time
 *
 * Each job uses an idempotent jobId so restarts never create duplicates.
 */
import { announcementQueue } from '../queues/index.js';
import { isQueueActive } from '../queues/queueManager.js';
import Announcement from '../models/Announcement.js';
import logger from '../utils/logger.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function broadcastJobId(announcementId) {
  return `announce-broadcast:${announcementId}`;
}

function archiveJobId(announcementId) {
  return `announce-archive:${announcementId}`;
}

/**
 * Safely remove an existing job by jobId (ignore if not found).
 */
async function removeJob(jobId) {
  try {
    const job = await announcementQueue.getJob(jobId);
    if (job) {
      // Only remove if still waiting or delayed — don't touch active jobs
      const state = await job.getState();
      if (state === 'waiting' || state === 'delayed') {
        await job.remove();
      }
    }
  } catch {
    // Job not found or already completed — safe to ignore
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Schedule a delayed broadcast job for a scheduled announcement.
 * For immediate announcements (delay <= 0), fires right away.
 */
export async function scheduleAnnouncementBroadcast(announcement) {
  if (!isQueueActive()) return;

  const id = announcement._id.toString();
  const delay = Math.max(0, new Date(announcement.scheduledFor).getTime() - Date.now());

  await removeJob(broadcastJobId(id));

  await announcementQueue.add(
    'broadcast-announcement',
    { announcementId: id },
    {
      jobId: broadcastJobId(id),
      delay,
      removeOnComplete: true,
      removeOnFail: { count: 50 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    }
  );

  if (delay > 0) {
    logger.info(`[Scheduler:Announcement] broadcast scheduled in ${Math.round(delay / 1000)}s for ${id}`);
  }
}

/**
 * Schedule a delayed archive job at the announcement's expiresAt time.
 */
export async function scheduleAnnouncementArchive(announcement) {
  if (!isQueueActive()) return;

  const id = announcement._id.toString();
  const delay = Math.max(0, new Date(announcement.expiresAt).getTime() - Date.now());

  await removeJob(archiveJobId(id));

  await announcementQueue.add(
    'archive-announcement',
    { announcementId: id },
    {
      jobId: archiveJobId(id),
      delay,
      removeOnComplete: true,
      removeOnFail: { count: 50 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    }
  );

  if (delay > 0) {
    logger.info(`[Scheduler:Announcement] archive scheduled in ${Math.round(delay / 60000)}m for ${id}`);
  }
}

/**
 * Reschedule both broadcast and archive when announcement is updated.
 * Only reschedules the specific job if the relevant date changed.
 */
export async function rescheduleAnnouncementBroadcast(announcement) {
  await scheduleAnnouncementBroadcast(announcement);
}

export async function rescheduleAnnouncementArchive(announcement) {
  await scheduleAnnouncementArchive(announcement);
}

/**
 * Cancel all pending jobs for an announcement (on delete or manual archive).
 */
export async function cancelAnnouncementJobs(announcementId) {
  if (!isQueueActive()) return;

  const id = typeof announcementId === 'string' ? announcementId : announcementId.toString();

  await Promise.allSettled([
    removeJob(broadcastJobId(id)),
    removeJob(archiveJobId(id)),
  ]);

  logger.info(`[Scheduler:Announcement] cancelled jobs for ${id}`);
}

/**
 * Recovery: on startup, find all announcements that need future jobs
 * and re-schedule them. This handles restarts gracefully.
 */
export async function recoverAnnouncementSchedules() {
  if (!isQueueActive()) return;

  const now = new Date();
  let recovered = 0;

  // 1. Scheduled announcements not yet broadcasted
  const pendingBroadcasts = await Announcement.find({
    isScheduled: true,
    scheduleBroadcasted: false,
    scheduledFor: { $gt: now },
  }).select('_id scheduledFor expiresAt').lean();

  for (const ann of pendingBroadcasts) {
    await scheduleAnnouncementBroadcast(ann);
    recovered++;
  }

  // 2. Overdue scheduled announcements (scheduledFor already passed, not yet broadcast)
  const overdueBroadcasts = await Announcement.find({
    isScheduled: true,
    scheduleBroadcasted: false,
    scheduledFor: { $lte: now },
  }).select('_id scheduledFor expiresAt').lean();

  for (const ann of overdueBroadcasts) {
    // Schedule with delay=0 so they fire immediately
    await announcementQueue.add(
      'broadcast-announcement',
      { announcementId: ann._id.toString() },
      {
        jobId: broadcastJobId(ann._id.toString()),
        delay: 0,
        removeOnComplete: true,
        removeOnFail: { count: 50 },
      }
    );
    recovered++;
  }

  // 3. Non-archived announcements with future expiry
  const pendingArchives = await Announcement.find({
    isArchived: false,
    expiresAt: { $gt: now },
  }).select('_id expiresAt').lean();

  for (const ann of pendingArchives) {
    await scheduleAnnouncementArchive(ann);
    recovered++;
  }

  // 4. Expired but not yet archived announcements
  const overdueArchives = await Announcement.find({
    isArchived: false,
    expiresAt: { $lte: now },
  }).select('_id expiresAt').lean();

  for (const ann of overdueArchives) {
    await announcementQueue.add(
      'archive-announcement',
      { announcementId: ann._id.toString() },
      {
        jobId: archiveJobId(ann._id.toString()),
        delay: 0,
        removeOnComplete: true,
        removeOnFail: { count: 50 },
      }
    );
    recovered++;
  }

  if (recovered > 0) {
    logger.info(`[Scheduler:Announcement] recovered ${recovered} jobs on startup`);
  }
}
