/**
 * Slack Notification Service
 * Main service for sending smart, contextual Slack notifications
 * Handles threading, batching, quiet hours, and role-based routing
 */

import SlackWorkspace from '../../models/SlackWorkspace.js';
import SlackUser from '../../models/SlackUser.js';
import SlackNotification from '../../models/SlackNotification.js';
import SlackApiClient from './SlackApiClient.js';
import SlackBlockKitBuilder from './SlackBlockKitBuilder.js';
import {
  queueNotification,
  queueBatchProcess,
  queueAppHomeUpdate
} from './SlackNotificationQueue.js';
import User from '../../models/User.js';

const blockBuilder = new SlackBlockKitBuilder(process.env.FRONTEND_URL);

class SlackNotificationService {
  constructor() {
    this.roleNotificationTypes = {
      admin: [
        'system_alert', 'user_registered', 'user_verified', 'user_approved',
        'user_declined', 'high_level_report', 'approval_request'
      ],
      manager: [
        'progress_update', 'performance_alert', 'delay_warning',
        'team_activity', 'task_completed', 'task_overdue', 'deadline_approaching'
      ],
      member: [
        'task_assigned', 'task_updated', 'task_completed', 'task_deleted',
        'task_due_soon', 'task_overdue', 'comment_added', 'comment_mention',
        'reminder_due_soon', 'status_change'
      ]
    };
  }

  /**
   * Main method to send a Slack notification
   */
  async sendNotification(notificationData) {
    try {
      const {
        userId,
        type,
        task,
        board,
        triggeredBy,
        comment,
        customMessage,
        priority,
        forceImmediate = false,
        // Additional fields for specific notification types
        oldStatus,
        newStatus,
        subtask,
        announcement,
        team,
        reminder,
        attachment,
        assignees,
        changes,
        hoursRemaining,
        // Pre-fetched objects for optimization
        preFetchedSlackUser,
        preFetchedUser
      } = notificationData;

      // Get user if not provided
      const user = preFetchedUser || await User.findById(userId).lean();
      if (!user) {
        console.log('User not found for Slack notification');
        return null;
      }

      // Get Slack connection if not provided
      const slackUser = preFetchedSlackUser || await SlackUser.findByUserId(userId);
      if (!slackUser) {
        // Silent return for expected skips (user hasn't connected Slack)
        return null;
      }

      // Check if user should receive this notification
      if (!slackUser.shouldReceiveNotification(type, priority)) {
        console.log(`Notification ${type} filtered by user preferences for user ${user.name}`);
        return null;
      }

      // Get workspace
      const workspace = await SlackWorkspace.findById(slackUser.workspace);
      if (!workspace || !workspace.isActive || !workspace.settings.notificationsEnabled) {
        console.log('Slack workspace is inactive or notifications disabled');
        return null;
      }

      // Check quiet hours
      if (slackUser.isInQuietHours() && !forceImmediate && priority !== 'critical') {
        // Queue for later or add to digest
        await this.handleQuietHoursNotification(slackUser, notificationData);
        return { status: 'queued_quiet_hours' };
      }

      // Check if batching is enabled and appropriate
      if (
        slackUser.preferences.batchingEnabled &&
        !forceImmediate &&
        priority !== 'critical' &&
        !['task_assigned', 'comment_mention'].includes(type) // High-priority types always immediate
      ) {
        return this.addToBatch(slackUser, notificationData);
      }

      // Build notification payload
      const payload = await this.buildNotificationPayload(notificationData);
      if (!payload) {
        console.log('Failed to build notification payload');
        return null;
      }

      // Get channel (DM or thread)
      const channelInfo = await this.getNotificationChannel(slackUser, workspace, task);

      // Queue the notification
      const notification = await queueNotification({
        workspace,
        slackUser,
        user,
        type,
        title: payload.text,
        message: customMessage,
        channelId: channelInfo.channelId,
        threadTs: channelInfo.threadTs,
        blockKitPayload: payload,
        entityId: task?._id || comment?._id,
        entityType: task ? 'Card' : comment ? 'Comment' : null,
        relatedBoard: board?._id,
        sender: triggeredBy,
        priority
      });

      // Update App Home
      await queueAppHomeUpdate(slackUser._id, workspace._id);

      return notification;
    } catch (error) {
      console.error('Error sending Slack notification:', error);
      return null;
    }
  }

  /**
   * Send notification to multiple users
   * Optimized with bulk fetching to avoid N+1 queries
   */
  async sendToMultipleUsers(userIds, notificationData) {
    if (!userIds || userIds.length === 0) return { successful: 0, failed: 0, results: [] };

    const startTime = Date.now();
    console.log(`[Slack] Processing batch notification for ${userIds.length} users. Type: ${notificationData.type}`);

    try {
      // Bulk fetch active SlackUsers provided they have a slackUserId
      // Also populate the User model to avoid another query per user
      const slackUsers = await SlackUser.find({
        user: { $in: userIds },
        isActive: true,
        slackUserId: { $exists: true, $ne: '' }
      }).populate('user');

      const slackUserMap = new Map(slackUsers.map(su => [su.user._id.toString(), su]));
      
      console.log(`[Slack] Found ${slackUsers.length} connected Slack users out of ${userIds.length} targets.`);
      
      // Log skipped users (optional monitoring)
      if (slackUsers.length < userIds.length) {
        const skippedCount = userIds.length - slackUsers.length;
        console.log(`[Slack] Skipped ${skippedCount} users (no Slack connection).`);
      }

      const results = await Promise.allSettled(
        userIds.map(userId => {
          const idString = userId.toString ? userId.toString() : userId;
          const slackUser = slackUserMap.get(idString);
          
          if (!slackUser) {
             // User has no connected Slack account - skip safely
             return Promise.resolve(null);
          }
          
          // Pass the pre-fetched objects to sendNotification
          // slackUser.user is the populated User document
          return this.sendNotification({ 
            ...notificationData, 
            userId, 
            preFetchedSlackUser: slackUser,
            preFetchedUser: slackUser.user
          });
        })
      );

      const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
      const failed = results.filter(r => r.status === 'rejected').length; // Only actual errors count as failed
      
      console.log(`[Slack] Batch complete. Sent: ${successful}, Skipped/Filtered: ${userIds.length - successful - failed}, Errors: ${failed}. Time: ${Date.now() - startTime}ms`);

      return {
        successful,
        failed,
        results
      };
    } catch (error) {
      console.error('[Slack] Batch processing error:', error);
      return { successful: 0, failed: userIds.length, results: [] };
    }
  }

  /**
   * Send role-based notifications
   */
  async sendRoleBasedNotification(notificationData) {
    const { type, departmentId, teamId, excludeUserId } = notificationData;
    
    const targetRole = this.getRoleForNotificationType(type);
    if (!targetRole) {
      console.log('No role mapping for notification type:', type);
      return null;
    }

    // Build user query based on role and scope
    const userQuery = {
      isActive: true,
      isVerified: true
    };

    if (targetRole === 'admin') {
      userQuery.role = 'admin';
    } else if (targetRole === 'manager') {
      userQuery.role = { $in: ['admin', 'manager', 'team_lead'] };
      if (departmentId) userQuery.department = departmentId;
      if (teamId) userQuery.team = teamId;
    } else {
      // Members - scope to department/team
      if (departmentId) userQuery.department = departmentId;
      if (teamId) userQuery.team = teamId;
    }

    if (excludeUserId) {
      userQuery._id = { $ne: excludeUserId };
    }

    const users = await User.find(userQuery).select('_id').lean();
    const userIds = users.map(u => u._id);

    return this.sendToMultipleUsers(userIds, {
      ...notificationData,
      roleBasedRouting: targetRole
    });
  }

  /**
   * Send task notification
   */
  async sendTaskNotification(type, task, options = {}) {
    const { triggeredBy, assignees = [], customMessage, board } = options;

    // Populate task if needed
    const populatedTask = task.board 
      ? task 
      : await (await import('../../models/Card.js')).default
          .findById(task._id || task)
          .populate('board', 'name')
          .populate('assignees', 'name email')
          .lean();

    const taskBoard = board || populatedTask.board;
    const taskAssignees = assignees.length > 0 ? assignees : populatedTask.assignees || [];

    // Get Slack users for assignees
    const slackUsers = await SlackUser.find({
      user: { $in: taskAssignees.map(a => a._id || a) },
      isActive: true
    }).lean();

    const slackUserMap = new Map(slackUsers.map(su => [su.user.toString(), su]));

    // Enrich assignees with Slack IDs
    const enrichedAssignees = taskAssignees.map(a => ({
      ...a,
      slackUserId: slackUserMap.get((a._id || a).toString())?.slackUserId
    }));

    // Send to all assignees
    const results = await Promise.allSettled(
      taskAssignees.map(assignee => 
        this.sendNotification({
          userId: assignee._id || assignee,
          type,
          task: populatedTask,
          board: taskBoard,
          triggeredBy,
          assignees: enrichedAssignees,
          customMessage,
          priority: populatedTask.priority || 'medium'
        })
      )
    );

    return {
      successful: results.filter(r => r.status === 'fulfilled' && r.value).length,
      failed: results.filter(r => r.status === 'rejected').length
    };
  }

  /**
   * Send task completion celebration
   */
  async sendTaskCompletionCelebration(task, completedBy, board) {
    const payload = blockBuilder.buildTaskCompletionCelebration({
      task,
      completedBy,
      board,
      stats: null // Can be populated with project stats
    });

    // Send to task assignees and watchers
    const recipients = [...(task.assignees || []), ...(task.watchers || [])];
    const uniqueRecipients = [...new Set(recipients.map(r => r.toString()))];

    return this.sendToMultipleUsers(uniqueRecipients, {
      type: 'task_completed',
      task,
      board,
      triggeredBy: completedBy,
      priority: 'low',
      payload
    });
  }

  /**
   * Send deadline reminder
   */
  async sendDeadlineReminder(task, urgency) {
    const board = task.board || await (await import('../../models/Board.js')).default
      .findById(task.board)
      .lean();

    const payload = blockBuilder.buildDeadlineReminder({
      task,
      board,
      dueDate: task.dueDate,
      urgency
    });

    const priority = urgency === 'overdue' ? 'high' : urgency === 'today' ? 'medium' : 'low';

    return this.sendToMultipleUsers(task.assignees || [], {
      type: urgency === 'overdue' ? 'task_overdue' : 'task_due_soon',
      task,
      board,
      priority,
      payload
    });
  }

  /**
   * Send comment notification
   */
  async sendCommentNotification(comment, task, author, mentionedUserIds = []) {
    const board = task.board || await (await import('../../models/Board.js')).default
      .findById(task.board)
      .lean();

    // Get Slack users for mentions
    const mentionedSlackUsers = await SlackUser.find({
      user: { $in: mentionedUserIds },
      isActive: true
    }).populate('user', 'name').lean();

    const enrichedMentions = mentionedSlackUsers.map(su => ({
      name: su.user.name,
      slackUserId: su.slackUserId
    }));

    // Send to mentioned users
    if (mentionedUserIds.length > 0) {
      await this.sendToMultipleUsers(mentionedUserIds, {
        type: 'comment_mention',
        task,
        board,
        comment,
        triggeredBy: author,
        mentionedUsers: enrichedMentions,
        priority: 'high'
      });
    }

    // Send to task assignees (excluding author and mentioned users)
    const assigneeIds = (task.assignees || [])
      .map(a => a.toString())
      .filter(id => 
        id !== author._id.toString() && 
        !mentionedUserIds.map(m => m.toString()).includes(id)
      );

    if (assigneeIds.length > 0) {
      await this.sendToMultipleUsers(assigneeIds, {
        type: 'comment_added',
        task,
        board,
        comment,
        triggeredBy: author,
        priority: 'medium'
      });
    }
  }

  /**
   * Build notification payload based on type
   */
  async buildNotificationPayload(data) {
    const { type, task, board, triggeredBy, comment, customMessage, assignees, oldStatus, newStatus, subtask, announcement, team, reminder, attachment } = data;

    switch (type) {
      case 'task_assigned':
      case 'task_updated':
      case 'task_created':
      case 'task_deleted':
      case 'task_moved':
        return blockBuilder.buildTaskNotification({
          type,
          task,
          triggeredBy,
          board,
          priority: task?.priority,
          status: task?.status,
          dueDate: task?.dueDate,
          assignees,
          subtaskInfo: task?.subtaskStats,
          customMessage
        });

      case 'task_completed':
        return blockBuilder.buildTaskCompletionCelebration({
          task,
          completedBy: triggeredBy,
          board
        });

      case 'status_change':
      case 'status_changed':
        return blockBuilder.buildTaskNotification({
          type: 'status_change',
          task,
          triggeredBy,
          board,
          priority: task?.priority,
          status: newStatus || task?.status,
          customMessage: customMessage || `Status changed from ${oldStatus || 'Unknown'} to ${newStatus || task?.status}`
        });

      case 'task_due_soon':
      case 'task_overdue':
      case 'deadline_reminder':
        const urgency = type === 'task_overdue' ? 'overdue' : 
          this.calculateUrgency(task?.dueDate);
        return blockBuilder.buildDeadlineReminder({
          task,
          board,
          dueDate: task?.dueDate,
          urgency
        });

      case 'comment_added':
      case 'comment_mention':
        return blockBuilder.buildCommentNotification({
          comment,
          task,
          board,
          author: triggeredBy,
          isMention: type === 'comment_mention',
          mentionedUsers: assignees
        });

      case 'subtask_completed':
      case 'subtask_updated':
      case 'subtask_created':
      case 'all_subtasks_completed':
        return blockBuilder.buildTaskNotification({
          type,
          task,
          triggeredBy,
          board,
          priority: task?.priority,
          subtaskInfo: subtask || task?.subtaskStats,
          customMessage: customMessage || (type === 'all_subtasks_completed' ? '🎉 All subtasks completed!' : `Subtask "${subtask?.title || 'Unknown'}" updated`)
        });

      case 'project_update':
      case 'project_updated':
      case 'project_created':
      case 'board_updated':
        return blockBuilder.buildTaskNotification({
          type: 'project_update',
          task: null,
          triggeredBy,
          board,
          customMessage: customMessage || `Project "${board?.name}" has been updated`
        });

      case 'team_member_added':
      case 'team_invite':
        return {
          text: `You've been added to team "${team?.name || 'Unknown'}"`,
          blocks: [
            blockBuilder.header(`👥 Welcome to ${team?.name || 'the team'}!`),
            blockBuilder.section(`${triggeredBy?.name || 'Someone'} added you to the team.`),
            blockBuilder.divider(),
            blockBuilder.context([`Team: ${team?.name || 'Unknown'}`])
          ]
        };

      case 'announcement':
      case 'announcement_created':
        return {
          text: `📢 New Announcement: ${announcement?.title || 'New announcement'}`,
          blocks: [
            blockBuilder.header(`📢 ${announcement?.title || 'Announcement'}`),
            blockBuilder.section(announcement?.content || 'No content'),
            blockBuilder.divider(),
            blockBuilder.context([
              `Posted by ${triggeredBy?.name || 'Admin'}`,
              announcement?.createdAt ? `at ${new Date(announcement.createdAt).toLocaleString()}` : ''
            ])
          ]
        };

      case 'reminder':
      case 'reminder_due_soon':
        return {
          text: `⏰ Reminder: ${task?.title || reminder?.message || 'Task reminder'}`,
          blocks: [
            blockBuilder.header('⏰ Reminder'),
            blockBuilder.section(`*${task?.title || reminder?.message || 'You have a reminder'}*`),
            task && blockBuilder.context([
              `📁 ${board?.name || 'Unknown Project'}`,
              task.dueDate ? `📅 Due: ${new Date(task.dueDate).toLocaleDateString()}` : ''
            ]),
            blockBuilder.divider(),
            task && blockBuilder.actions('reminder_actions', [
              blockBuilder.linkButton('📋 View Task', blockBuilder.taskUrl(task._id, board?._id), 'view_task'),
              blockBuilder.button('✅ Mark Complete', 'mark_complete', task._id?.toString(), 'primary')
            ])
          ].filter(Boolean)
        };

      case 'attachment_added':
        return blockBuilder.buildTaskNotification({
          type: 'task_updated',
          task,
          triggeredBy,
          board,
          customMessage: `New attachment added: ${attachment?.fileName || 'file'}`
        });

      default:
        // Generic notification
        return blockBuilder.buildTaskNotification({
          type,
          task,
          triggeredBy,
          board,
          customMessage
        });
    }
  }

  /**
   * Get notification channel (DM or thread)
   */
  async getNotificationChannel(slackUser, workspace, task) {
    let channelId = slackUser.dmChannelId;
    let threadTs = null;

    // If threading is enabled and we have a task, use thread
    if (
      workspace.settings.threadedNotifications &&
      slackUser.preferences.preferThreadedReplies &&
      task?._id
    ) {
      const existingThread = slackUser.getTaskThread(task._id);
      if (existingThread) {
        channelId = existingThread.channelId;
        threadTs = existingThread.threadTs;
      }
    }

    // If no DM channel, we'll need to open one when sending
    if (!channelId) {
      channelId = slackUser.slackUserId; // Will be converted to DM channel
    }

    return { channelId, threadTs };
  }

  /**
   * Add notification to batch
   */
  async addToBatch(slackUser, notificationData) {
    const { type, task, customMessage, priority } = notificationData;

    slackUser.addToBatch({
      type,
      title: task?.title || customMessage || type,
      message: customMessage,
      entityId: task?._id,
      entityType: 'Card',
      priority
    });

    await slackUser.save();

    // Schedule batch processing if not already scheduled
    const workspace = await SlackWorkspace.findById(slackUser.workspace);
    const batchInterval = workspace?.settings?.batchIntervalMinutes || 5;

    // Check if we should trigger batch now
    const timeSinceLastBatch = Date.now() - (slackUser.lastBatchSentAt?.getTime() || 0);
    if (timeSinceLastBatch >= batchInterval * 60 * 1000) {
      await queueBatchProcess(slackUser._id, workspace._id);
    }

    return { status: 'batched' };
  }

  /**
   * Handle notification during quiet hours
   */
  async handleQuietHoursNotification(slackUser, notificationData) {
    // Add to batch for delivery after quiet hours
    return this.addToBatch(slackUser, {
      ...notificationData,
      wasInQuietHours: true
    });
  }

  /**
   * Update task thread
   */
  async updateTaskThread(slackUser, taskId, channelId, messageTs) {
    slackUser.setTaskThread(taskId, channelId, messageTs);
    await slackUser.save();
  }

  /**
   * Get role for notification type
   */
  getRoleForNotificationType(type) {
    for (const [role, types] of Object.entries(this.roleNotificationTypes)) {
      if (types.includes(type)) {
        return role;
      }
    }
    return 'member'; // Default to member
  }

  /**
   * Calculate deadline urgency
   */
  calculateUrgency(dueDate) {
    if (!dueDate) return null;

    const now = new Date();
    const due = new Date(dueDate);
    const diffHours = (due - now) / (1000 * 60 * 60);

    if (diffHours < 0) return 'overdue';
    if (diffHours < 24) return 'today';
    if (diffHours < 48) return 'tomorrow';
    if (diffHours < 72) return 'soon';
    return null;
  }

  /**
   * Send announcement notification using Block Kit builder
   */
  async sendAnnouncement(announcement, targetUsers, sender) {
    // Use the new block kit builder for professional announcement template
    const payload = blockBuilder.buildAnnouncementNotification({
      announcement,
      triggeredBy: sender
    });

    return this.sendToMultipleUsers(targetUsers, {
      type: 'announcement_created',
      customMessage: announcement.title,
      priority: announcement.priority || 'medium',
      payload
    });
  }

  /**
   * Send system alert to admins
   */
  async sendSystemAlert(alertData) {
    const { title, message, severity = 'medium' } = alertData;

    return this.sendRoleBasedNotification({
      type: 'system_alert',
      customMessage: title,
      description: message,
      priority: severity === 'critical' ? 'critical' : severity === 'high' ? 'high' : 'medium'
    });
  }
}

// Export singleton instance
const slackNotificationService = new SlackNotificationService();
export default slackNotificationService;
export { SlackNotificationService };
