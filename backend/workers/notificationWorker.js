/**
 * Notification Worker
 * 
 * Processes jobs from the 'flowtask:notification' queue.
 * Job types: create-notification, create-bulk-notifications,
 *            notify-project-created, notify-user-registered,
 *            notify-user-created, send-push
 */
import { Worker } from 'bullmq';
import { getWorkerConnection } from '../queues/connection.js';
import notificationService from '../utils/notificationService.js';
import { sendPushNotification } from '../utils/pushNotification.js';
import {
  sendReminderNotification,
  markOverdueReminders,
  scheduleNextReminder,
} from '../utils/reminderScheduler.js';
import Reminder from '../models/Reminder.js';
import Card from '../models/Card.js';
import config from '../config/index.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import { isDoneStatus } from '../schedulers/cardDueDateScheduler.js';
import { evaluateAndDeliverBulk } from '../services/notifications/NotificationDecisionEngine.js';

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

  /**
   * Process a reminder notification (fires 24 hours before due).
   * Data: { reminderId }
   */
  async 'process-reminder-notification'(job) {
    const { reminderId } = job.data;

    // No workspaceId travels on this job (enqueued by reminderScheduler.js,
    // which only knows the reminderId) — look it up unscoped first, then run
    // the rest inside its own workspace.
    const reminder = await workspaceContext.runUnscoped(async () => await Reminder.findById(reminderId)
      .populate('project', 'name clientDetails')
      .populate('createdBy', 'name email')
      .populate('department', 'name'));

    if (!reminder || reminder.status !== 'pending') {
      return { skipped: true, reason: 'not pending or not found' };
    }

    // Skip if already notified
    if (reminder.notificationSentAt) {
      return { skipped: true, reason: 'already notified' };
    }

    return workspaceContext.run({ workspaceId: reminder.workspaceId }, async () => {
      await sendReminderNotification(reminder);
      return { notified: true, reminderId };
    });
  },

  /**
   * Mark a reminder as overdue/missed (fires 24 hours after due date).
   * Data: { reminderId }
   */
  async 'process-reminder-overdue'(job) {
    const { reminderId } = job.data;

    const reminder = await workspaceContext.runUnscoped(async () => await Reminder.findById(reminderId));
    if (!reminder || reminder.status !== 'pending') {
      return { skipped: true, reason: 'not pending or not found' };
    }

    // Only mark missed if scheduledDate + 24h has actually passed
    const overdueTime = new Date(reminder.scheduledDate).getTime() + 24 * 60 * 60 * 1000;
    if (Date.now() < overdueTime) {
      return { skipped: true, reason: 'not yet overdue' };
    }

    return workspaceContext.run({ workspaceId: reminder.workspaceId }, async () => {
      reminder.status = 'missed';
      reminder.history.push({
        action: 'missed',
        timestamp: new Date(),
        notes: 'Automatically marked as missed (overdue by more than 24 hours)',
      });
      await reminder.save();

      console.log(`[Worker:Notification] reminder ${reminderId} marked as missed`);
      return { marked: 'missed' };
    });
  },

  /**
   * Due-soon alert for a card's due date (fires 24h before due).
   * Data: { cardId }
   */
  async 'process-card-due-soon'(job) {
    const { cardId } = job.data;

    const card = await workspaceContext.runUnscoped(async () => Card.findById(cardId)
      .populate('board', 'name department workspaceId')
      .populate('assignees', '_id'));

    if (!card || card.isArchived || isDoneStatus(card.status) || !card.dueDate) {
      return { skipped: true, reason: 'not_eligible' };
    }
    if (card.notificationState?.dueSoonNotifiedAt) {
      return { skipped: true, reason: 'already_notified' };
    }
    if (new Date(card.dueDate).getTime() <= Date.now()) {
      return { skipped: true, reason: 'already_overdue' };
    }

    return workspaceContext.run({ workspaceId: card.workspaceId }, async () => {
      await evaluateAndDeliverBulk(card.assignees, {
        type: 'task_due_soon',
        workspaceId: card.workspaceId,
        entity: { type: 'Card', id: card._id },
        title: 'Task Due Soon',
        message: `"${card.title}" is due soon`,
        slackPayload: { task: card, board: card.board, priority: card.priority },
      });

      card.notificationState = card.notificationState || {};
      card.notificationState.dueSoonNotifiedAt = new Date();
      await card.save();

      return { notified: true, cardId };
    });
  },

  /**
   * Overdue alert for a card's due date (fires at the due date/time).
   * Data: { cardId }
   */
  async 'process-card-overdue'(job) {
    const { cardId } = job.data;

    const card = await workspaceContext.runUnscoped(async () => Card.findById(cardId)
      .populate('board', 'name department workspaceId')
      .populate('assignees', '_id'));

    if (!card || card.isArchived || isDoneStatus(card.status) || !card.dueDate) {
      return { skipped: true, reason: 'not_eligible' };
    }
    if (card.notificationState?.overdueNotifiedAt) {
      return { skipped: true, reason: 'already_notified' };
    }
    if (new Date(card.dueDate).getTime() > Date.now()) {
      return { skipped: true, reason: 'not_yet_overdue' };
    }

    return workspaceContext.run({ workspaceId: card.workspaceId }, async () => {
      await evaluateAndDeliverBulk(card.assignees, {
        type: 'task_overdue',
        workspaceId: card.workspaceId,
        entity: { type: 'Card', id: card._id },
        title: 'Task Overdue',
        message: `"${card.title}" is overdue`,
        slackPayload: { task: card, board: card.board, priority: card.priority, forceImmediate: true },
      });

      card.notificationState = card.notificationState || {};
      card.notificationState.overdueNotifiedAt = new Date();
      await card.save();

      return { notified: true, cardId };
    });
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
      // Jobs enqueued via backgroundTasks.js's withWorkspace() carry the
      // originating request's workspace on job.data.workspaceId — re-enter
      // it here since this worker has no ambient context of its own. The
      // reminder handlers resolve their own context internally instead
      // (they're enqueued with only a reminderId, no workspaceId).
      if (job.data?.workspaceId) {
        return workspaceContext.run({ workspaceId: job.data.workspaceId }, () => handler(job));
      }
      return handler(job);
    },
    {
      connection: getWorkerConnection(),
      concurrency: config.queues.notification.concurrency,
      limiter: {
        max: 50,
        duration: 10_000,   // max 50 notifications per 10 seconds
      },
    }
  );

  notificationWorker.on('failed', (job, err) => {
    console.error(`[Worker:Notification] ${job?.name}:${job?.id} failed: ${err.message}`);
  });

  console.log('[Worker:Notification] started');
  return notificationWorker;
}

export function getNotificationWorker() {
  return notificationWorker;
}
