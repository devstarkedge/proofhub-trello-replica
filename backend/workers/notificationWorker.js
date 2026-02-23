/**
 * Notification Worker
 * 
 * Processes jobs from the 'flowtask:notification' queue.
 * Job types: create-notification, create-bulk-notifications,
 *            notify-project-created, notify-user-registered,
 *            notify-user-created, send-push
 */
import { Worker } from 'bullmq';
import { createRedisConnection } from '../queues/connection.js';
import notificationService from '../utils/notificationService.js';
import { sendPushNotification } from '../utils/pushNotification.js';
import config from '../config/index.js';

const JOB_HANDLERS = {
  /**
   * Create a single in-app notification.
   * Data: same shape as notificationService.createNotification
   */
  async 'create-notification'(job) {
    await notificationService.createNotification(job.data);
    return { created: 1 };
  },

  /**
   * Create bulk notifications.
   * Data: { notifications: [...notificationData] }
   */
  async 'create-bulk-notifications'(job) {
    const { notifications } = job.data;
    await notificationService.createBulkNotifications(notifications);
    return { created: notifications.length };
  },

  /**
   * Notify about project creation.
   * Data: { board, creatorId }
   */
  async 'notify-project-created'(job) {
    const { board, creatorId } = job.data;
    await notificationService.notifyProjectCreated(board, creatorId);
    return { notified: true };
  },

  /**
   * Notify admins about user registration.
   * Data: { user, adminIds }
   */
  async 'notify-user-registered'(job) {
    const { user, adminIds } = job.data;
    await notificationService.notifyUserRegistered(user, adminIds);
    return { notified: true };
  },

  /**
   * Notify admins about user created by admin.
   * Data: { user, admins, meta }
   */
  async 'notify-user-created'(job) {
    const { user, admins, meta } = job.data;
    const notifications = [];
    const departmentName = meta?.departmentName || 'No department assigned';
    for (const admin of admins) {
      notifications.push({
        type: 'user_created',
        title: 'New User Created',
        message: `A new user ${user.name} (${user.email}) has been created and assigned to ${departmentName}.`,
        user: admin._id || admin,
        sender: meta?.creatorId || null,
      });
    }
    await notificationService.createBulkNotifications(notifications);
    return { notified: admins.length };
  },

  /**
   * Send a web push notification.
   * Data: { notification, pushSubscription }
   */
  async 'send-push'(job) {
    const { notification, pushSubscription } = job.data;
    if (pushSubscription) {
      await sendPushNotification(notification, pushSubscription);
    }
    return { sent: !!pushSubscription };
  },
};

// ─── Worker Creation ──────────────────────────────────────────────────────────

let notificationWorker = null;

export function startNotificationWorker() {
  notificationWorker = new Worker(
    'flowtask.notification',
    async (job) => {
      const handler = JOB_HANDLERS[job.name];
      if (!handler) {
        throw new Error(`Unknown notification job type: ${job.name}`);
      }
      return handler(job);
    },
    {
      connection: createRedisConnection(),
      concurrency: config.queues.notification.concurrency,
    }
  );

  notificationWorker.on('completed', (job, result) => {
    if (config.isDev) console.log(`[NotificationWorker] Job ${job.id} (${job.name}) completed:`, result);
  });

  notificationWorker.on('failed', (job, err) => {
    console.error(`[NotificationWorker] Job ${job?.id} (${job?.name}) failed:`, err.message);
  });

  console.log('[NotificationWorker] Started');
  return notificationWorker;
}

export function getNotificationWorker() {
  return notificationWorker;
}
