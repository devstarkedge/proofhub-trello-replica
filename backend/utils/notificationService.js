import Notification from '../models/Notification.js';
import User from '../models/User.js';
import Department from '../models/Department.js';
import { emitNotification } from '../server.js';
import { sendEmail } from './email.js';
import { sendPushNotification } from './pushNotification.js';

class NotificationService {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  // Main notification creation method
  async createNotification(notificationData, options = {}) {
    try {
      const { type, title, message, user, sender, relatedCard, relatedBoard, relatedTeam } = notificationData;

      // Check user settings before creating notification
      const userDoc = await User.findById(user).select('settings role department team pushSubscription');
      if (!userDoc) return null;

      // Check if user has enabled this notification type
      if (!this.shouldSendNotification(userDoc.settings, type)) {
        return null;
      }

      // Create the notification
      const notification = await Notification.create({
        type,
        title,
        message,
        user,
        sender,
        relatedCard,
        relatedBoard,
        relatedTeam
      });

      // Send real-time notification via socket
      emitNotification(user.toString(), notification);

      // Send email notification if enabled
      if (userDoc.settings.notifications.email) {
        await this.sendEmailNotification(notification, userDoc);
      }

      // Send push notification if enabled and subscription exists
      if (userDoc.settings.notifications.push && userDoc.pushSubscription) {
        await this.sendPushNotification(notification, userDoc);
      }

      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      return null;
    }
  }

  // Check if notification should be sent based on user settings
  shouldSendNotification(settings, type) {
    if (!settings || !settings.notifications) return true;

    const notificationSettings = settings.notifications;

    switch (type) {
      case 'task_assigned':
        return notificationSettings.taskAssigned;
      case 'task_updated':
        return notificationSettings.taskUpdated;
      case 'task_deleted':
        return notificationSettings.taskDeleted;
      case 'comment_mention':
        return notificationSettings.commentMention;
      case 'project_updates':
        return notificationSettings.projectUpdates;
      case 'user_registered':
        return notificationSettings.userCreated;
      default:
        return true;
    }
  }

  // Send email notification
  async sendEmailNotification(notification, user) {
    try {
      if (!user.email) {
        console.log('No email address found for user, skipping email notification');
        return;
      }

      const emailData = {
        to: user.email,
        subject: notification.title,
        html: this.generateEmailTemplate(notification, user)
      };

      await sendEmail(emailData);
    } catch (error) {
      console.error('Error sending email notification:', error);
    }
  }

  // Send push notification
  async sendPushNotification(notification, user) {
    try {
      if (user.pushSubscription && user.pushSubscription.endpoint) {
        await sendPushNotification(notification, user.pushSubscription);
      } else {
        console.log('No valid push subscription found for user, skipping push notification');
      }
    } catch (error) {
      console.error('Error sending push notification:', error);
    }
  }

  // Generate email HTML template
  generateEmailTemplate(notification, user) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${notification.title}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #6366f1; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: #6366f1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>FlowTask</h1>
              <h2>${notification.title}</h2>
            </div>
            <div class="content">
              <p>Hello ${user.name},</p>
              <p>${notification.message}</p>
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" class="button">View in FlowTask</a>
              <p style="margin-top: 20px; font-size: 12px; color: #666;">
                You're receiving this email because you have notifications enabled in your FlowTask settings.
                You can change your notification preferences in your <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings">settings</a>.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  // Bulk notification creation with role-based filtering
  async createBulkNotifications(notifications, options = {}) {
    const results = [];

    for (const notification of notifications) {
      const result = await this.createNotification(notification, options);
      if (result) results.push(result);
    }

    return results;
  }

  // Task assignment notifications
  async notifyTaskAssigned(card, assigneeId, assignerId) {
    const notifications = [];

    // Notify the assignee
    if (assigneeId !== assignerId) {
      notifications.push({
        type: 'task_assigned',
        title: 'Task Assigned',
        message: `You have been assigned to "${card.title}"`,
        user: assigneeId,
        sender: assignerId,
        relatedCard: card._id,
        relatedBoard: card.board
      });
    }

    return this.createBulkNotifications(notifications);
  }

  // Task update notifications
  async notifyTaskUpdated(card, updaterId, changes = {}) {
    const notifications = [];

    // Notify assignees
    if (card.assignees && card.assignees.length > 0) {
      card.assignees.forEach(assigneeId => {
        if (assigneeId.toString() !== updaterId) {
          let message = `"${card.title}" has been updated`;

          if (changes.dueDate) {
            message = `Due date for "${card.title}" has been updated to ${new Date(changes.dueDate).toLocaleDateString()}`;
          } else if (changes.status === 'done') {
            message = `"${card.title}" has been marked as complete`;
          }

          notifications.push({
            type: 'task_updated',
            title: 'Task Updated',
            message,
            user: assigneeId,
            sender: updaterId,
            relatedCard: card._id,
            relatedBoard: card.board
          });
        }
      });
    }

    return this.createBulkNotifications(notifications);
  }

  // Task deletion notifications
  async notifyTaskDeleted(card, deleterId) {
    const notifications = [];

    // Notify assignees
    if (card.assignees && card.assignees.length > 0) {
      card.assignees.forEach(assigneeId => {
        if (assigneeId.toString() !== deleterId) {
          notifications.push({
            type: 'task_deleted',
            title: 'Task Deleted',
            message: `The task "${card.title}" has been deleted`,
            user: assigneeId,
            sender: deleterId,
            relatedCard: card._id,
            relatedBoard: card.board
          });
        }
      });
    }

    return this.createBulkNotifications(notifications);
  }

  // Comment notifications
  async notifyCommentAdded(card, comment, commenterId) {
    const notifications = [];

    // Notify assignees
    if (card.assignees && card.assignees.length > 0) {
      card.assignees.forEach(assigneeId => {
        if (assigneeId.toString() !== commenterId) {
          notifications.push({
            type: 'comment_added',
            title: 'New Comment',
            message: `${comment.user.name} commented on "${card.title}"`,
            user: assigneeId,
            sender: commenterId,
            relatedCard: card._id,
            relatedBoard: card.board
          });
        }
      });
    }

    // Process mentions in comment
    await this.processMentions(comment.htmlContent || comment.text, card, commenterId);

    return this.createBulkNotifications(notifications);
  }

  // Process mentions in text
  async processMentions(text, card, senderId) {
    const mentionRegex = /data-id=["']([^"']+)["']/g;
    const mentions = new Set();

    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      mentions.add(match[1]);
    }

    const notifications = [];
    for (const mentionedId of mentions) {
      if (mentionedId !== senderId) {
        notifications.push({
          type: 'comment_mention',
          title: 'You were mentioned',
          message: `You were mentioned in a comment on "${card.title}"`,
          user: mentionedId,
          sender: senderId,
          relatedCard: card._id,
          relatedBoard: card.board
        });
      }
    }

    return this.createBulkNotifications(notifications);
  }

  // Project notifications
  async notifyProjectCreated(board, creatorId) {
    const notifications = [];

    // Notify project members
    if (board.members && board.members.length > 0) {
      board.members.forEach(memberId => {
        if (memberId.toString() !== creatorId) {
          notifications.push({
            type: 'project_created',
            title: 'New Project Created',
            message: `You have been assigned to the project "${board.name}"`,
            user: memberId,
            sender: creatorId,
            relatedBoard: board._id
          });
        }
      });
    }

    // Notify department managers
    const department = await Department.findById(board.department).populate('managers');
    if (department && department.managers) {
      department.managers.forEach(manager => {
        if (manager._id.toString() !== creatorId) {
          notifications.push({
            type: 'project_created',
            title: 'New Project Created',
            message: `A new project "${board.name}" has been created in your department`,
            user: manager._id,
            sender: creatorId,
            relatedBoard: board._id
          });
        }
      });
    }

    return this.createBulkNotifications(notifications);
  }

  // User registration notifications (for admins)
  async notifyUserRegistered(user, adminUsers) {
    const notifications = [];

    adminUsers.forEach(adminId => {
      notifications.push({
        type: 'user_registered',
        title: 'New User Registration',
        message: `${user.name} has registered and is waiting for verification`,
        user: adminId,
        sender: user._id,
        relatedTeam: user.team
      });
    });

    return this.createBulkNotifications(notifications);
  }

  // Queue processing for scalability
  async addToQueue(notificationData, options = {}) {
    this.queue.push({ notificationData, options });

    if (!this.processing) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const { notificationData, options } = this.queue.shift();
      await this.createNotification(notificationData, options);

      // Small delay to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.processing = false;
  }
}

export default new NotificationService();
