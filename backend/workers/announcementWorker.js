/**
 * Announcement Worker
 * 
 * Processes repeatable jobs from the 'flowtask:announcement' queue.
 * Replaces the setInterval-based approach in backgroundTasks.js.
 * Job types: process-scheduled, archive-expired
 */
import { Worker } from 'bullmq';
import { createRedisConnection } from '../queues/connection.js';
import Announcement from '../models/Announcement.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { getIO } from '../realtime/index.js';
import notificationService from '../utils/notificationService.js';
import config from '../config/index.js';

const JOB_HANDLERS = {
  /**
   * Process scheduled announcements that are due for broadcast.
   */
  async 'process-scheduled'(job) {
    const now = new Date();

    const scheduledAnnouncements = await Announcement.find({
      isScheduled: true,
      scheduleBroadcasted: false,
      scheduledFor: { $lte: now },
    })
      .populate('createdBy')
      .populate('subscribers.users')
      .populate('subscribers.departments');

    let totalBroadcasted = 0;

    for (const announcement of scheduledAnnouncements) {
      try {
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

        // Send emails (fire-and-forget within worker)
        notificationService.sendAnnouncementEmails(announcement, subscriberIds);

        totalBroadcasted++;
        console.log(`[AnnouncementWorker] Broadcasted ${announcement._id} to ${subscriberIds.length} users`);
      } catch (error) {
        console.error(`[AnnouncementWorker] Broadcast error for ${announcement._id}:`, error.message);
      }
    }

    return { processed: scheduledAnnouncements.length, broadcasted: totalBroadcasted };
  },

  /**
   * Archive announcements that have passed their expiry date.
   */
  async 'archive-expired'(job) {
    const now = new Date();

    const expiredAnnouncements = await Announcement.find({
      expiresAt: { $lte: now },
      isArchived: false,
    });

    let archived = 0;

    for (const announcement of expiredAnnouncements) {
      try {
        announcement.isArchived = true;
        announcement.archivedAt = now;

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

        archived++;
      } catch (error) {
        console.error(`[AnnouncementWorker] Archive error for ${announcement._id}:`, error.message);
      }
    }

    if (archived > 0) {
      console.log(`[AnnouncementWorker] Archived ${archived} expired announcements`);
    }

    return { found: expiredAnnouncements.length, archived };
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
        throw new Error(`Unknown announcement job type: ${job.name}`);
      }
      return handler(job);
    },
    {
      connection: createRedisConnection(),
      concurrency: 1, // Only one at a time to avoid duplicate broadcasts
    }
  );

  announcementWorker.on('completed', (job, result) => {
    if (config.isDev) console.log(`[AnnouncementWorker] Job ${job.id} (${job.name}) completed:`, result);
  });

  announcementWorker.on('failed', (job, err) => {
    console.error(`[AnnouncementWorker] Job ${job?.id} (${job?.name}) failed:`, err.message);
  });

  console.log('[AnnouncementWorker] Started');
  return announcementWorker;
}

export function getAnnouncementWorker() {
  return announcementWorker;
}
