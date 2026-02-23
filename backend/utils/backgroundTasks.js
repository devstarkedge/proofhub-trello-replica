/**
 * Background Tasks — BullMQ-first with in-process fallback
 * 
 * When Redis/BullMQ is available (isQueueActive() === true), tasks are
 * enqueued as durable jobs with retry, backoff, and persistence.
 * 
 * When Redis is unavailable, tasks run in-process via setImmediate
 * (original behavior) so the app still works in development without Redis.
 * 
 * Callers don't need to change — the same exported functions work either way.
 */
import { sendEmail } from './email.js';
import notificationService from './notificationService.js';
import { sendPushNotification } from './pushNotification.js';
import Announcement from '../models/Announcement.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import Attachment from '../models/Attachment.js';
import { getIO } from '../realtime/index.js';
import { deleteFromCloudinary, deleteMultipleFromCloudinary } from './cloudinary.js';
import { isQueueActive } from '../queues/queueManager.js';
import {
  enqueueEmail,
  enqueueProjectEmails,
  enqueueNotification,
  enqueueProjectCreatedNotification,
  enqueueUserRegisteredNotification,
  enqueueUserCreatedNotification,
  enqueuePush,
  enqueueActivity,
} from '../queues/index.js';

// ─── Generic setImmediate runner (fallback) ─────────────────────────────────

export const runBackground = (fn) => {
  try {
    setImmediate(async () => {
      try {
        await fn();
      } catch (err) {
        console.error('Background task failed:', err);
      }
    });
  } catch (err) {
    console.error('Failed to schedule background task:', err);
  }
};

// ─── Email ──────────────────────────────────────────────────────────────────

export const sendEmailInBackground = (emailOptions) => {
  if (isQueueActive()) {
    enqueueEmail(emailOptions).catch((err) =>
      console.error('Failed to enqueue email:', err.message)
    );
    return;
  }
  runBackground(async () => {
    try { await sendEmail(emailOptions); }
    catch (err) { console.error('sendEmailInBackground error:', err); }
  });
};

// ─── Notifications ──────────────────────────────────────────────────────────

export const createNotificationInBackground = (notificationData) => {
  if (isQueueActive()) {
    enqueueNotification(notificationData).catch((err) =>
      console.error('Failed to enqueue notification:', err.message)
    );
    return;
  }
  runBackground(async () => {
    try { await notificationService.createNotification(notificationData); }
    catch (err) { console.error('createNotificationInBackground error:', err); }
  });
};

export const notifyProjectCreatedInBackground = (board, creatorId) => {
  if (isQueueActive()) {
    // Serialize board to plain object for Redis
    const boardData = board.toJSON ? board.toJSON() : board;
    enqueueProjectCreatedNotification({ board: boardData, creatorId }).catch((err) =>
      console.error('Failed to enqueue project-created notification:', err.message)
    );
    return;
  }
  runBackground(async () => {
    try { await notificationService.notifyProjectCreated(board, creatorId); }
    catch (err) { console.error('notifyProjectCreatedInBackground error:', err); }
  });
};

export const sendProjectEmailsInBackground = (board, members) => {
  if (isQueueActive()) {
    const boardData = board.toJSON ? board.toJSON() : board;
    enqueueProjectEmails({ board: boardData, memberIds: members }).catch((err) =>
      console.error('Failed to enqueue project emails:', err.message)
    );
    return;
  }
  runBackground(async () => {
    try {
      const memberDocs = await User.find({ _id: { $in: members } }).select('email name');
      for (const member of memberDocs) {
        if (member.email) {
          await sendEmail({
            to: member.email,
            subject: `You've been added to project: ${board.name}`,
            html: `
              <h2>New Project Assignment</h2>
              <p>Hi ${member.name},</p>
              <p>You have been added to the project <strong>${board.name}</strong>.</p>
              <p>Description: ${board.description || 'No description provided'}</p>
              <p>Start Date: ${board.startDate ? new Date(board.startDate).toLocaleDateString() : 'Not set'}</p>
              <p>Due Date: ${board.dueDate ? new Date(board.dueDate).toLocaleDateString() : 'Not set'}</p>
              <br>
              <p>Best regards,<br>FlowTask Team</p>
            `,
          });
        }
      }
    } catch (err) { console.error('sendProjectEmailsInBackground error:', err); }
  });
};

// ─── Activity Logging ───────────────────────────────────────────────────────

export const logProjectActivityInBackground = (activityData) => {
  if (isQueueActive()) {
    enqueueActivity(activityData).catch((err) =>
      console.error('Failed to enqueue activity:', err.message)
    );
    return;
  }
  runBackground(async () => {
    try {
      const Activity = (await import('../models/Activity.js')).default;
      await Activity.create(activityData);
    } catch (err) { console.error('logProjectActivityInBackground error:', err); }
  });
};

// ─── Admin Notifications ────────────────────────────────────────────────────

export const notifyAdminsUserRegisteredInBackground = (user, adminIds) => {
  if (isQueueActive()) {
    const userData = user.toJSON ? user.toJSON() : user;
    enqueueUserRegisteredNotification({ user: userData, adminIds }).catch((err) =>
      console.error('Failed to enqueue user-registered notification:', err.message)
    );
    return;
  }
  runBackground(async () => {
    try { await notificationService.notifyUserRegistered(user, adminIds); }
    catch (err) { console.error('notifyAdminsUserRegisteredInBackground error:', err); }
  });
};

export const notifyAdminsUserCreatedInBackground = (user, admins, meta = {}) => {
  if (isQueueActive()) {
    const userData = user.toJSON ? user.toJSON() : user;
    const adminsData = admins.map((a) => (a.toJSON ? a.toJSON() : a));
    enqueueUserCreatedNotification({ user: userData, admins: adminsData, meta }).catch((err) =>
      console.error('Failed to enqueue user-created notification:', err.message)
    );
    return;
  }
  runBackground(async () => {
    try {
      const notifications = [];
      const departmentName = meta.departmentName || 'No department assigned';
      admins.forEach((admin) => {
        notifications.push({
          type: 'user_created',
          title: 'New User Created',
          message: `A new user ${user.name} (${user.email}) has been created and assigned to ${departmentName}.`,
          user: admin._id || admin,
          sender: meta.creatorId || null,
        });
      });
      await notificationService.createBulkNotifications(notifications);
    } catch (err) { console.error('notifyAdminsUserCreatedInBackground error:', err); }
  });
};

// ─── Push Notifications ─────────────────────────────────────────────────────

export const sendPushInBackground = (notification, pushSubscription) => {
  if (isQueueActive()) {
    enqueuePush({ notification, pushSubscription }).catch((err) =>
      console.error('Failed to enqueue push:', err.message)
    );
    return;
  }
  runBackground(async () => {
    try { if (pushSubscription) await sendPushNotification(notification, pushSubscription); }
    catch (err) { console.error('sendPushInBackground error:', err); }
  });
};

// ─── Scheduled / Repeatable Tasks (fallback only) ──────────────────────────
// When BullMQ is active, these are handled by repeatable jobs in queueManager.
// The functions below only run when Redis is unavailable.

export const processScheduledAnnouncements = () => {
  runBackground(async () => {
    try {
      const now = new Date();
      const scheduledAnnouncements = await Announcement.find({
        isScheduled: true,
        scheduleBroadcasted: false,
        scheduledFor: { $lte: now },
      }).populate('createdBy').populate('subscribers.users').populate('subscribers.departments');

      for (const announcement of scheduledAnnouncements) {
        try {
          let subscriberIds = [];
          if (announcement.subscribers.type === 'all') {
            const users = await User.find({ isActive: true, isVerified: true }).select('_id');
            subscriberIds = users.map((u) => u._id);
          } else if (announcement.subscribers.type === 'departments') {
            const users = await User.find({
              department: { $in: announcement.subscribers.departments },
              isActive: true, isVerified: true,
            }).select('_id');
            subscriberIds = users.map((u) => u._id);
          } else if (announcement.subscribers.type === 'users') {
            subscriberIds = announcement.subscribers.users.map((u) => u._id || u);
          } else if (announcement.subscribers.type === 'managers') {
            const users = await User.find({ role: 'manager', isActive: true, isVerified: true }).select('_id');
            subscriberIds = users.map((u) => u._id);
          }

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

          subscriberIds.forEach((userId) => {
            getIO().to(`user-${userId}`).emit('announcement-created', {
              announcement: announcement.toJSON(),
              notification: { type: 'announcement_created', title: 'New Announcement', message: `${announcement.createdBy.name} posted: ${announcement.title}` },
            });
          });

          announcement.scheduleBroadcasted = true;
          announcement.broadcastedAt = new Date();
          announcement.broadcastedTo = subscriberIds;
          await announcement.save();
          notificationService.sendAnnouncementEmails(announcement, subscriberIds);
          console.log(`Scheduled announcement ${announcement._id} broadcasted to ${subscriberIds.length} users`);
        } catch (error) {
          console.error(`Error broadcasting scheduled announcement ${announcement._id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error processing scheduled announcements:', error);
    }
  });
};

export const archiveExpiredAnnouncements = () => {
  runBackground(async () => {
    try {
      const now = new Date();
      const expiredAnnouncements = await Announcement.find({ expiresAt: { $lte: now }, isArchived: false });

      for (const announcement of expiredAnnouncements) {
        try {
          announcement.isArchived = true;
          announcement.archivedAt = now;
          if (announcement.isPinned) { announcement.isPinned = false; announcement.pinPosition = undefined; }
          await announcement.save();
          getIO().emit('announcement-archived', { announcementId: announcement._id, isArchived: true, reason: 'expired' });
          console.log(`Announcement ${announcement._id} archived due to expiry`);
        } catch (error) {
          console.error(`Error archiving announcement ${announcement._id}:`, error);
        }
      }
      if (expiredAnnouncements.length > 0) console.log(`${expiredAnnouncements.length} announcements archived`);
    } catch (error) {
      console.error('Error archiving expired announcements:', error);
    }
  });
};

export const cleanupTrash = () => {
  setTimeout(async () => {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const trashItems = await Attachment.find({ isDeleted: true, deletedAt: { $lte: thirtyDaysAgo } }).lean();
      if (trashItems.length === 0) { console.log('[Trash Cleanup] No items to clean up'); return; }
      console.log(`[Trash Cleanup] Found ${trashItems.length} items to permanently delete`);

      const imageIds = trashItems.filter((a) => a.resourceType === 'image').map((a) => a.publicId);
      const rawIds = trashItems.filter((a) => a.resourceType !== 'image').map((a) => a.publicId);
      try {
        if (imageIds.length > 0) { await deleteMultipleFromCloudinary(imageIds, 'image'); console.log(`[Trash Cleanup] Deleted ${imageIds.length} images from Cloudinary`); }
        if (rawIds.length > 0) { await deleteMultipleFromCloudinary(rawIds, 'raw'); console.log(`[Trash Cleanup] Deleted ${rawIds.length} raw files from Cloudinary`); }
      } catch (error) { console.error('[Trash Cleanup] Cloudinary deletion error:', error.message); }

      const deleted = await Attachment.deleteMany({ _id: { $in: trashItems.map((a) => a._id) } });
      console.log(`[Trash Cleanup] Deleted ${deleted.deletedCount} attachments from database`);
    } catch (error) {
      console.error('[Trash Cleanup] Error during cleanup:', error);
    }
  }, 5000);
};

// ─── Startup ────────────────────────────────────────────────────────────────
// When BullMQ is active, repeatable jobs handle scheduled tasks.
// This function is only needed as fallback when Redis is unavailable.

export const startBackgroundJobs = () => {
  if (isQueueActive()) {
    console.log('[BackgroundTasks] BullMQ active — repeatable jobs handle scheduled work');
    return;
  }

  console.log('[BackgroundTasks] No Redis — using in-process setInterval fallback');
  setInterval(() => processScheduledAnnouncements(), 30000);
  setInterval(() => archiveExpiredAnnouncements(), 300000);
  setInterval(() => cleanupTrash(), 6 * 60 * 60 * 1000);
  cleanupTrash();
  console.log('Background jobs started: scheduled announcements, expiry handler, and trash cleanup');
};

export default {
  runBackground,
  sendEmailInBackground,
  createNotificationInBackground,
  notifyAdminsUserRegisteredInBackground,
  notifyAdminsUserCreatedInBackground,
  sendPushInBackground,
  processScheduledAnnouncements,
  archiveExpiredAnnouncements,
  cleanupTrash,
  startBackgroundJobs,
  notifyProjectCreatedInBackground,
  sendProjectEmailsInBackground,
  logProjectActivityInBackground,
};
