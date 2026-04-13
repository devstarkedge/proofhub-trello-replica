/**
 * Announcement Worker (Event-Driven)
 *
 * Processes exact delayed jobs from the 'flowtask.announcement' queue.
 * Each job targets a single announcement by ID — no DB scanning.
 *
 * Job types:
 *   broadcast-announcement  — broadcast a single scheduled announcement
 *   archive-announcement    — archive a single expired announcement
 */
import { Worker } from 'bullmq';
import { getWorkerConnection } from '../queues/connection.js';
import Announcement from '../models/Announcement.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { getIO } from '../realtime/index.js';
import notificationService from '../utils/notificationService.js';
import { scheduleAnnouncementArchive } from '../schedulers/announcementScheduler.js';
import config from '../config/index.js';

const JOB_HANDLERS = {
  /**
   * Broadcast a single scheduled announcement by ID.
   * Idempotent: skips if already broadcasted.
   */
  async 'broadcast-announcement'(job) {
    const { announcementId } = job.data;

    const announcement = await Announcement.findById(announcementId)
      .populate('createdBy')
      .populate('subscribers.users')
      .populate('subscribers.departments');

    if (!announcement) {
      return { skipped: true, reason: 'not found' };
    }

    // Idempotency: already broadcasted
    if (announcement.scheduleBroadcasted) {
      return { skipped: true, reason: 'already broadcasted' };
    }

    let subscriberIds = [];

    if (announcement.subscribers.type === 'all') {
      const users = await User.find({ isActive: true, isVerified: true }).select('_id');
      subscriberIds = users.map((u) => u._id);
    } else if (announcement.subscribers.type === 'departments') {
      const users = await User.find({
        department: { $in: announcement.subscribers.departments },
        isActive: true,
        isVerified: true,
      }).select('_id');
      subscriberIds = users.map((u) => u._id);
    } else if (announcement.subscribers.type === 'users') {
      subscriberIds = announcement.subscribers.users.map((u) => u._id || u);
    } else if (announcement.subscribers.type === 'managers') {
      const users = await User.find({
        role: 'manager',
        isActive: true,
        isVerified: true,
      }).select('_id');
      subscriberIds = users.map((u) => u._id);
    }

    // Create notifications
    const notifications = subscriberIds.map((userId) => ({
      type: 'announcement_created',
      title: 'New Announcement',
      message: `${announcement.createdBy.name} posted: ${announcement.title}`,
      user: userId,
      sender: announcement.createdBy._id,
      relatedAnnouncement: announcement._id,
      isRead: false,
    }));

    await Notification.insertMany(notifications);

    // Emit real-time
    const io = getIO();
    subscriberIds.forEach((userId) => {
      io.to(`user-${userId}`).emit('announcement-created', {
        announcement: announcement.toJSON(),
        notification: {
          type: 'announcement_created',
          title: 'New Announcement',
          message: `${announcement.createdBy.name} posted: ${announcement.title}`,
        },
      });
    });

    // Mark broadcasted
    announcement.scheduleBroadcasted = true;
    announcement.broadcastedAt = new Date();
    announcement.broadcastedTo = subscriberIds;
    await announcement.save();

    // Send emails (fire-and-forget)
    notificationService.sendAnnouncementEmails(announcement, subscriberIds);

    console.log(`[Worker:Announcement] broadcast:${announcementId} → ${subscriberIds.length} users`);
    return { broadcasted: true, recipients: subscriberIds.length };
  },

  /**
   * Archive a single expired announcement by ID.
   * Idempotent: skips if already archived.
   */
  async 'archive-announcement'(job) {
    const { announcementId } = job.data;

    const announcement = await Announcement.findById(announcementId);

    if (!announcement) {
      return { skipped: true, reason: 'not found' };
    }

    // Idempotency: already archived
    if (announcement.isArchived) {
      return { skipped: true, reason: 'already archived' };
    }

    announcement.isArchived = true;
    announcement.archivedAt = new Date();

    if (announcement.isPinned) {
      announcement.isPinned = false;
      announcement.pinPosition = undefined;
    }

    await announcement.save();

    getIO().emit('announcement-archived', {
      announcementId: announcement._id,
      isArchived: true,
      reason: 'expired',
    });

    console.log(`[Worker:Announcement] archive:${announcementId} completed`);
    return { archived: true };
  },
};

// ─── Worker Creation ──────────────────────────────────────────────────────────

let announcementWorker = null;

export function startAnnouncementWorker() {
  announcementWorker = new Worker(
    'flowtask.announcement',
    async (job) => {
      const handler = JOB_HANDLERS[job.name];
      if (!handler) {
        // Silently skip stale/unknown jobs (e.g. leftover polling jobs in Redis)
        console.warn(`[Worker:Announcement] skipping unknown job type: ${job.name} (${job.id})`);
        return { skipped: true, reason: `unknown job type: ${job.name}` };
      }
      return handler(job);
    },
    {
      connection: getWorkerConnection(),
      concurrency: 2,
    }
  );

  announcementWorker.on('failed', (job, err) => {
    console.error(`[Worker:Announcement] ${job?.name}:${job?.id} failed: ${err.message}`);
  });

  console.log('[Worker:Announcement] started');
  return announcementWorker;
}

export function getAnnouncementWorker() {
  return announcementWorker;
}
