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

  // Priority mapping based on notification type
  getPriorityForType(type) {
    const highPriorityTypes = [
      'task_overdue', 'deadline_approaching', 'task_due_soon', 
      'reminder_missed', 'system_alert'
    ];
    const criticalPriorityTypes = ['user_registered', 'system_alert'];
    const lowPriorityTypes = ['test_notification', 'announcement_created'];
    
    if (criticalPriorityTypes.includes(type)) return 'critical';
    if (highPriorityTypes.includes(type)) return 'high';
    if (lowPriorityTypes.includes(type)) return 'low';
    return 'medium';
  }

  // Main notification creation method
  async createNotification(notificationData, options = {}) {
    try {
      const { 
        type, 
        title, 
        message, 
        user, 
        sender, 
        relatedCard, 
        relatedBoard, 
        relatedTeam,
        entityId,
        entityType,
        action,
        priority: explicitPriority,
        metadata
      } = notificationData;

      // Check user settings before creating notification
      const userDoc = await User.findById(user).select('settings role department team pushSubscription email name');
      if (!userDoc) return null;

      // Check if user has enabled this notification type
      if (!this.shouldSendNotification(userDoc.settings, type)) {
        return null;
      }

      // Determine priority (explicit > auto-assigned)
      const priority = explicitPriority || this.getPriorityForType(type);

      // Create the notification
      const notification = await Notification.create({
        type,
        title,
        message,
        user,
        sender,
        relatedCard,
        relatedBoard,
        relatedTeam,
        entityId: entityId || relatedCard || relatedBoard || relatedTeam,
        entityType: entityType || (relatedCard ? 'Card' : relatedBoard ? 'Board' : relatedTeam ? 'Team' : null),
        action,
        priority,
        metadata: metadata || {}
      });

      // Populate for socket emission
      const populatedNotification = await Notification.findById(notification._id)
        .populate('sender', 'name email avatar')
        .populate('relatedCard', 'title')
        .populate('relatedBoard', 'name')
        .lean();

      // Send real-time notification via socket
      emitNotification(user.toString(), populatedNotification);

      // Send email notification if enabled
      if (userDoc.settings?.notifications?.email) {
        await this.sendEmailNotification(notification, userDoc);
      }

      // Send push notification if enabled and subscription exists
      if (userDoc.settings?.notifications?.push && userDoc.pushSubscription) {
        await this.sendPushNotification(notification, userDoc);
      }

      return populatedNotification;
    } catch (error) {
      console.error('Error creating notification:', error);
      return null;
    }
  }

  // Check if notification should be sent based on user settings
  shouldSendNotification(settings, type) {
    if (!settings || !settings.notifications) return true;

    const notificationSettings = settings.notifications;

    const notificationPreferences = {
      task_assigned: notificationSettings.taskAssigned,
      task_updated: notificationSettings.taskUpdated,
      task_deleted: notificationSettings.taskDeleted,
      comment_mention: notificationSettings.commentMention,
      project_updates: notificationSettings.projectUpdates,
      user_registered: notificationSettings.userCreated,
      user_verified: notificationSettings.userCreated,
      account_created: true, // Always send account creation notifications
      user_created: notificationSettings.userCreated,
      user_assigned: true, // Always send assignment notifications
      user_unassigned: true, // Always send unassignment notifications
    };

    return notificationPreferences[type] !== undefined ? notificationPreferences[type] : true;
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
      throw error; // Re-throw to allow caller to handle
    }
  }

  // Send push notification
  async sendPushNotification(notification, user) {
    try {
      if (user.pushSubscription && user.pushSubscription.endpoint) {
        await sendPushNotification(notification, user.pushSubscription);
      } else {
        if (process.env.NODE_ENV !== 'production') console.log('No valid push subscription found for user, skipping push notification');
      }
    } catch (error) {
      console.error('Error sending push notification:', error);
      throw error; // Re-throw to allow caller to handle
    }
  }

  // Generate email HTML template
  generateEmailTemplate(notification, user) {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    let specificUrl = baseUrl;

    // Generate specific URL based on notification type
    switch (notification.type) {
      case 'task_assigned':
      case 'task_updated':
      case 'task_deleted':
      case 'comment_added':
      case 'comment_mention':
        specificUrl = `${baseUrl}/board/${notification.relatedBoard}?card=${notification.relatedCard}`;
        break;
      case 'project_created':
      case 'project_deleted':
      case 'project_updates':
        specificUrl = `${baseUrl}/board/${notification.relatedBoard}`;
        break;
      case 'user_registered':
      case 'user_verified':
        specificUrl = `${baseUrl}/admin/users`;
        break;
      default:
        specificUrl = baseUrl;
    }

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${notification.title}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; font-weight: 300; }
            .header h2 { margin: 10px 0 0 0; font-size: 18px; font-weight: 500; }
            .content { padding: 30px 20px; background: #ffffff; }
            .content p { margin: 0 0 15px 0; font-size: 16px; }
            .highlight { background: #f8f9fa; padding: 15px; border-left: 4px solid #667eea; margin: 20px 0; border-radius: 4px; }
            .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: 600; margin: 20px 0; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); }
            .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #e9ecef; }
            .footer a { color: #667eea; text-decoration: none; }
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
              <div class="highlight">
                <p><strong>${notification.message}</strong></p>
              </div>
              <div style="text-align: center;">
                <a href="${specificUrl}" class="button">View Details</a>
              </div>
              <p>This notification is related to your recent activity in FlowTask. Click the button above to see more details and take action if needed.</p>
            </div>
            <div class="footer">
              <p>You're receiving this email because you have notifications enabled in your FlowTask settings.</p>
              <p>You can change your notification preferences in your <a href="${baseUrl}/settings">settings</a>.</p>
              <p>&copy; 2025 FlowTask. All rights reserved.</p>
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

  // User registration notifications (for admins and managers)
  async notifyUserRegistered(user, recipients) {
    const notifications = [];

    recipients.forEach(recipientId => {
      notifications.push({
        type: 'user_registered',
        title: 'New User Registration',
        message: `${user.name} has registered and is waiting for verification`,
        user: recipientId,
        sender: user._id,
        relatedTeam: user.team
      });
    });

    return this.createBulkNotifications(notifications);
  }

  // User verification notifications (for admins and managers)
  async notifyUserVerified(user, recipients) {
    const notifications = [];

    recipients.forEach(recipientId => {
      notifications.push({
        type: 'user_verified',
        title: 'User Verification Complete',
        message: `${user.name} has been verified and can now access the system`,
        user: recipientId,
        sender: user._id,
        relatedTeam: user.team
      });
    });

    return this.createBulkNotifications(notifications);
  }

  // Send announcement emails in background
  async sendAnnouncementEmails(announcement, subscriberIds) {
    try {
      // Get subscriber details
      const subscribers = await User.find({
        _id: { $in: subscriberIds },
        settings: { $elemMatch: { 'notifications.email': true } }
      }).select('email name');

      const promises = subscribers.map(subscriber => {
        return new Promise((resolve) => {
          // Queue email sending to prevent blocking
          setTimeout(async () => {
            try {
              const emailData = {
                to: subscriber.email,
                subject: `New Announcement: ${announcement.title}`,
                html: this.generateAnnouncementEmailTemplate(announcement, subscriber)
              };
              await sendEmail(emailData);
              resolve(true);
            } catch (error) {
              console.error(`Error sending announcement email to ${subscriber.email}:`, error);
              resolve(false);
            }
          }, Math.random() * 5000); // Stagger requests over 5 seconds
        });
      });

      await Promise.all(promises);
    } catch (error) {
      console.error('Error queuing announcement emails:', error);
    }
  }

  // Generate announcement email template
  generateAnnouncementEmailTemplate(announcement, subscriber) {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const announcementUrl = `${baseUrl}/announcements?id=${announcement._id}`;

    const categoryColor = {
      'HR': '#9333ea',
      'Urgent': '#dc2626',
      'System Update': '#2563eb',
      'Events': '#eab308',
      'General': '#6b7280'
    };

    const categoryBg = {
      'HR': '#f3e8ff',
      'Urgent': '#fee2e2',
      'System Update': '#eff6ff',
      'Events': '#fefce8',
      'General': '#f3f4f6'
    };

    const color = categoryColor[announcement.category] || '#6b7280';
    const bg = categoryBg[announcement.category] || '#f3f4f6';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${announcement.title}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; font-weight: 300; }
            .header h2 { margin: 10px 0 0 0; font-size: 18px; font-weight: 500; }
            .content { padding: 30px 20px; background: #ffffff; }
            .announcement-title { font-size: 22px; font-weight: 700; margin: 0 0 10px 0; color: #1f2937; }
            .announcement-category { display: inline-block; background: ${bg}; color: ${color}; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 15px; }
            .announcement-meta { font-size: 13px; color: #6b7280; margin: 10px 0; }
            .announcement-body { font-size: 15px; line-height: 1.8; color: #374151; margin: 20px 0; }
            .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: 600; margin: 20px 0; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); }
            .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #e9ecef; }
            .footer a { color: #667eea; text-decoration: none; }
            .author-info { display: flex; align-items: center; gap: 10px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
            .author-avatar { width: 40px; height: 40px; border-radius: 50%; background: #e5e7eb; }
            .author-details { font-size: 14px; }
            .author-name { font-weight: 600; color: #1f2937; }
            .author-title { color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔔 FlowTask Announcement</h1>
              <h2>You Have a New Announcement</h2>
            </div>
            <div class="content">
              <p>Hello ${subscriber.name},</p>
              
              <div class="announcement-category">${announcement.category}</div>
              <h2 class="announcement-title">${announcement.title}</h2>
              
              <div class="announcement-meta">
                <strong>Posted:</strong> ${new Date(announcement.createdAt).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
              
              <div class="announcement-body">
                ${announcement.description.replace(/\n/g, '<br>')}
              </div>

              ${announcement.attachments && announcement.attachments.length > 0 ? `
                <div style="margin: 20px 0; padding: 15px; background: #f9fafb; border-radius: 8px;">
                  <strong style="font-size: 14px;">📎 Attachments:</strong>
                  <ul style="margin: 10px 0 0 20px; padding: 0;">
                    ${announcement.attachments.map(att => `
                      <li style="margin: 5px 0;">
                        <a href="${att.url}" style="color: #667eea; text-decoration: none;">
                          ${att.originalName}
                        </a>
                      </li>
                    `).join('')}
                  </ul>
                </div>
              ` : ''}

              <div class="author-info">
                <div style="flex-grow: 1;">
                  <div class="author-name">👤 ${announcement.createdBy?.name || 'Administrator'}</div>
                  ${announcement.createdBy?.title ? `<div class="author-title">${announcement.createdBy.title}</div>` : ''}
                </div>
              </div>

              <div style="text-align: center;">
                <a href="${announcementUrl}" class="button">View Full Announcement</a>
              </div>

              <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
                You can view all announcements and interact with them in the <a href="${baseUrl}/announcements" style="color: #667eea;">Announcements section</a> of FlowTask.
              </p>
            </div>
            <div class="footer">
              <p>You're receiving this email because you were selected as a subscriber for this announcement.</p>
              <p>You can manage your notification preferences in your <a href="${baseUrl}/settings">settings</a>.</p>
              <p>&copy; 2025 FlowTask. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
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
