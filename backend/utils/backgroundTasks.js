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
import User from '../models/User.js';
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

// ─── Legacy Scheduled Tasks (no-ops — handled by event-driven BullMQ jobs) ──

export const processScheduledAnnouncements = () => {};
export const archiveExpiredAnnouncements = () => {};
export const cleanupTrash = () => {};

// ─── Startup ────────────────────────────────────────────────────────────────
// No-op — all scheduled work is now handled by BullMQ workers and schedulers.

export const startBackgroundJobs = () => {};

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
