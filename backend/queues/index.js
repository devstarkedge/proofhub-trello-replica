/**
 * BullMQ Queue Definitions
 * 
 * All application queues in one place. Each queue uses the shared Redis
 * connection (publishing side). Workers create their own connections.
 * 
 * Queue naming: 'flowtask:<domain>' to namespace cleanly.
 */
import { Queue } from 'bullmq';
import { getSharedConnection } from './connection.js';
import config from '../config/index.js';

const defaultJobOptions = {
  attempts: config.queues.defaultAttempts,
  backoff: config.queues.defaultBackoff,
  removeOnComplete: { count: 1000, age: 24 * 3600 },   // keep last 1000 or 24h
  removeOnFail: { count: 5000, age: 7 * 24 * 3600 },   // keep last 5000 or 7d
};

// ─── Queue Factory ────────────────────────────────────────────────────────────

function createQueue(name, opts = {}) {
  return new Queue(name, {
    connection: getSharedConnection(),
    defaultJobOptions: { ...defaultJobOptions, ...opts },
  });
}

// ─── Queue Instances ──────────────────────────────────────────────────────────

/** Transactional & bulk email delivery */
export const emailQueue = createQueue('flowtask.email');

/** In-app + push notification creation */
export const notificationQueue = createQueue('flowtask.notification');

/** Activity logging (audit trail) */
export const activityQueue = createQueue('flowtask.activity');

/** Scheduled announcements & expiry archiving */
export const announcementQueue = createQueue('flowtask.announcement');

/** Trash / attachment cleanup */
export const cleanupQueue = createQueue('flowtask.cleanup');

/** Slack notification delivery */
export const slackQueue = createQueue('flowtask.slack');

// ─── Convenience: add jobs ────────────────────────────────────────────────────

/**
 * Enqueue: send a single email.
 * @param {{ to: string, subject: string, html: string }} data
 */
export function enqueueEmail(data, opts = {}) {
  return emailQueue.add('send-email', data, opts);
}

/**
 * Enqueue: send emails to many recipients (e.g. project members).
 * @param {{ recipients: Array<{email, name}>, subject: string, htmlTemplate: Function }} data
 */
export function enqueueBulkEmail(data, opts = {}) {
  return emailQueue.add('send-bulk-email', data, opts);
}

/**
 * Enqueue: send project-member emails.
 */
export function enqueueProjectEmails(data, opts = {}) {
  return emailQueue.add('send-project-emails', data, { priority: 5, ...opts });
}

/**
 * Enqueue: create an in-app notification.
 * @param {object} notificationData - same shape as notificationService.createNotification
 */
export function enqueueNotification(notificationData, opts = {}) {
  return notificationQueue.add('create-notification', notificationData, opts);
}

/**
 * Enqueue: bulk notifications.
 */
export function enqueueBulkNotifications(notifications, opts = {}) {
  return notificationQueue.add('create-bulk-notifications', { notifications }, opts);
}

/**
 * Enqueue: notify project created.
 */
export function enqueueProjectCreatedNotification(data, opts = {}) {
  return notificationQueue.add('notify-project-created', data, { priority: 3, ...opts });
}

/**
 * Enqueue: notify admins about new user registration.
 */
export function enqueueUserRegisteredNotification(data, opts = {}) {
  return notificationQueue.add('notify-user-registered', data, { priority: 3, ...opts });
}

/**
 * Enqueue: notify admins about new user created by admin.
 */
export function enqueueUserCreatedNotification(data, opts = {}) {
  return notificationQueue.add('notify-user-created', data, { priority: 3, ...opts });
}

/**
 * Enqueue: send a push notification.
 */
export function enqueuePush(data, opts = {}) {
  return notificationQueue.add('send-push', data, { priority: 5, ...opts });
}

/**
 * Enqueue: log an activity.
 */
export function enqueueActivity(activityData, opts = {}) {
  return activityQueue.add('log-activity', activityData, opts);
}

// ─── Export all queues for health checks / shutdown ───────────────────────────

export const allQueues = [
  emailQueue,
  notificationQueue,
  activityQueue,
  announcementQueue,
  cleanupQueue,
  slackQueue,
];
