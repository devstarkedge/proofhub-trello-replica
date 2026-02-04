/**
 * Slack Integration Hooks
 * Trigger points for sending Slack notifications from controllers
 */

import { slackNotificationService } from '../services/slack/index.js';

/**
 * Task/Card notification hooks
 */
export const slackHooks = {
  /**
   * Trigger when a task is assigned to user(s)
   */
  async onTaskAssigned(task, board, assignees, triggeredBy) {
    if (!slackNotificationService) {
      console.log('[Slack] slackNotificationService not available');
      return;
    }

    console.log(`[Slack] onTaskAssigned triggered for task "${task.title}" to ${assignees?.length || 0} assignees`);

    try {
      for (const assignee of assignees) {
        const userId = assignee._id || assignee;
        console.log(`[Slack] Sending task_assigned notification to user ${userId}`);
        
        await slackNotificationService.sendNotification({
          userId,
          type: 'task_assigned',
          task,
          board,
          triggeredBy,
          priority: 'high',
          forceImmediate: true // Bypass batching for immediate delivery
        });
      }
      console.log(`[Slack] onTaskAssigned completed for ${assignees?.length || 0} assignees`);
    } catch (error) {
      console.error('Slack onTaskAssigned hook error:', error);
    }
  },

  /**
   * Trigger when a task is updated
   */
  async onTaskUpdated(task, board, changes, triggeredBy) {
    if (!slackNotificationService) return;

    try {
      // Notify assignees of the update
      const assignees = task.assignedTo || [];
      for (const assignee of assignees) {
        // Don't notify the person who made the change
        if (assignee.toString() === triggeredBy._id?.toString()) continue;
        
        await slackNotificationService.sendNotification({
          userId: assignee._id || assignee,
          type: 'task_updated',
          task,
          board,
          changes,
          triggeredBy
        });
      }
    } catch (error) {
      console.error('Slack onTaskUpdated hook error:', error);
    }
  },

  /**
   * Trigger when a task status changes
   */
  async onTaskStatusChanged(task, board, oldStatus, newStatus, triggeredBy) {
    if (!slackNotificationService) return;

    try {
      const assignees = task.assignedTo || [];
      for (const assignee of assignees) {
        if (assignee.toString() === triggeredBy._id?.toString()) continue;
        
        await slackNotificationService.sendNotification({
          userId: assignee._id || assignee,
          type: 'status_change',
          task,
          board,
          oldStatus,
          newStatus,
          triggeredBy
        });
      }
    } catch (error) {
      console.error('Slack onTaskStatusChanged hook error:', error);
    }
  },

  /**
   * Trigger when a task is completed
   */
  async onTaskCompleted(task, board, triggeredBy) {
    if (!slackNotificationService) return;

    try {
      // Notify team members and watchers
      const notifyUsers = new Set();
      
      // Add assignees
      (task.assignedTo || []).forEach(a => notifyUsers.add(a.toString()));
      
      // Add board owner
      if (board.owner) notifyUsers.add(board.owner.toString());
      
      // Add watchers
      (task.watchers || []).forEach(w => notifyUsers.add(w.toString()));

      for (const userId of notifyUsers) {
        if (userId === triggeredBy._id?.toString()) continue;
        
        await slackNotificationService.sendNotification({
          userId,
          type: 'task_completed',
          task,
          board,
          triggeredBy
        });
      }
    } catch (error) {
      console.error('Slack onTaskCompleted hook error:', error);
    }
  },

  /**
   * Trigger when a task is deleted
   */
  async onTaskDeleted(task, board, triggeredBy) {
    if (!slackNotificationService) return;

    try {
      const assignees = task.assignedTo || [];
      for (const assignee of assignees) {
        if (assignee.toString() === triggeredBy._id?.toString()) continue;
        
        await slackNotificationService.sendNotification({
          userId: assignee._id || assignee,
          type: 'task_deleted',
          task,
          board,
          triggeredBy
        });
      }
    } catch (error) {
      console.error('Slack onTaskDeleted hook error:', error);
    }
  },

  /**
   * Trigger when a project (board) is updated
   */
  async onProjectUpdated(board, changes, triggeredBy) {
    if (!slackNotificationService) return;

    try {
      const members = board.members || [];
      for (const member of members) {
        const userId = member._id || member;
        if (userId.toString() === triggeredBy._id?.toString()) continue;

        await slackNotificationService.sendNotification({
          userId,
          type: 'project_updates',
          board,
          changes,
          triggeredBy
        });
      }
    } catch (error) {
      console.error('Slack onProjectUpdated hook error:', error);
    }
  },

  /**
   * Trigger when deadline is approaching
   */
  async onDeadlineReminder(task, board, hoursRemaining) {
    if (!slackNotificationService) return;

    try {
      const assignees = task.assignedTo || [];
      for (const assignee of assignees) {
        await slackNotificationService.sendNotification({
          userId: assignee._id || assignee,
          type: 'deadline_reminder',
          task,
          board,
          hoursRemaining,
          triggeredBy: { name: 'System', _id: 'system' }
        });
      }
    } catch (error) {
      console.error('Slack onDeadlineReminder hook error:', error);
    }
  },

  /**
   * Trigger when task becomes overdue
   */
  async onTaskOverdue(task, board) {
    if (!slackNotificationService) return;

    try {
      const assignees = task.assignedTo || [];
      for (const assignee of assignees) {
        await slackNotificationService.sendNotification({
          userId: assignee._id || assignee,
          type: 'task_overdue',
          task,
          board,
          triggeredBy: { name: 'System', _id: 'system' }
        });
      }
    } catch (error) {
      console.error('Slack onTaskOverdue hook error:', error);
    }
  },

  /**
   * Trigger when a comment is added
   */
  async onCommentAdded(comment, task, board, triggeredBy) {
    if (!slackNotificationService) return;

    try {
      const notifyUsers = new Set();
      
      // Add task assignees
      (task.assignedTo || []).forEach(a => notifyUsers.add(a.toString()));
      
      // Add mentioned users
      (comment.mentions || []).forEach(m => notifyUsers.add(m.toString()));

      for (const userId of notifyUsers) {
        if (userId === triggeredBy._id?.toString()) continue;
        
        const isMentioned = (comment.mentions || []).some(m => m.toString() === userId);
        
        await slackNotificationService.sendNotification({
          userId,
          type: isMentioned ? 'comment_mention' : 'comment_added',
          task,
          board,
          comment,
          triggeredBy
        });
      }
    } catch (error) {
      console.error('Slack onCommentAdded hook error:', error);
    }
  },

  /**
   * Trigger when user is mentioned in a comment
   */
  async onMention(userId, comment, task, board, triggeredBy) {
    if (!slackNotificationService) return;

    try {
      await slackNotificationService.sendNotification({
        userId,
        type: 'comment_mention',
        task,
        board,
        comment,
        triggeredBy
      });
    } catch (error) {
      console.error('Slack onMention hook error:', error);
    }
  },

  /**
   * Trigger when a subtask is completed
   */
  async onSubtaskCompleted(subtask, task, board, triggeredBy) {
    if (!slackNotificationService) return;

    try {
      const assignees = task.assignedTo || [];
      for (const assignee of assignees) {
        if (assignee.toString() === triggeredBy._id?.toString()) continue;
        
        await slackNotificationService.sendNotification({
          userId: assignee._id || assignee,
          type: 'subtask_completed',
          task,
          board,
          subtask,
          triggeredBy
        });
      }
    } catch (error) {
      console.error('Slack onSubtaskCompleted hook error:', error);
    }
  },

  /**
   * Trigger when all subtasks are completed
   */
  async onAllSubtasksCompleted(task, board, triggeredBy) {
    if (!slackNotificationService) return;

    try {
      const assignees = task.assignedTo || [];
      for (const assignee of assignees) {
        if (assignee.toString() === triggeredBy._id?.toString()) continue;
        
        await slackNotificationService.sendNotification({
          userId: assignee._id || assignee,
          type: 'all_subtasks_completed',
          task,
          board,
          triggeredBy
        });
      }
    } catch (error) {
      console.error('Slack onAllSubtasksCompleted hook error:', error);
    }
  },

  /**
   * Trigger for project/board updates
   */
  async onProjectUpdate(board, updateType, triggeredBy) {
    if (!slackNotificationService) return;

    try {
      const members = board.members || [];
      for (const member of members) {
        if (member.toString() === triggeredBy._id?.toString()) continue;
        
        await slackNotificationService.sendNotification({
          userId: member._id || member,
          type: 'project_update',
          board,
          updateType,
          triggeredBy
        });
      }
    } catch (error) {
      console.error('Slack onProjectUpdate hook error:', error);
    }
  },

  /**
   * Trigger when user is added to a team
   */
  async onTeamMemberAdded(team, member, triggeredBy) {
    if (!slackNotificationService) return;

    try {
      await slackNotificationService.sendNotification({
        userId: member._id || member,
        type: 'team_member_added',
        team,
        triggeredBy
      });
    } catch (error) {
      console.error('Slack onTeamMemberAdded hook error:', error);
    }
  },

  /**
   * Trigger when an announcement is posted
   */
  async onAnnouncementPosted(announcement, recipients, triggeredBy) {
    if (!slackNotificationService) return;

    try {
      // Use the dedicated sendAnnouncement method which uses Block Kit builder
      // with professional template and interactive buttons
      await slackNotificationService.sendAnnouncement(
        announcement,
        recipients,
        triggeredBy
      );
    } catch (error) {
      console.error('Slack onAnnouncementPosted hook error:', error);
    }
  },

  /**
   * Trigger for custom reminder
   */
  async onReminder(reminder, task, board) {
    if (!slackNotificationService) return;

    try {
      await slackNotificationService.sendNotification({
        userId: reminder.user,
        type: 'reminder',
        task,
        board,
        reminder,
        triggeredBy: { name: 'System', _id: 'system' }
      });
    } catch (error) {
      console.error('Slack onReminder hook error:', error);
    }
  },

  /**
   * Trigger when an attachment is added
   */
  async onAttachmentAdded(attachment, task, board, triggeredBy) {
    if (!slackNotificationService) return;

    try {
      const assignees = task.assignedTo || [];
      for (const assignee of assignees) {
        if (assignee.toString() === triggeredBy._id?.toString()) continue;
        
        await slackNotificationService.sendNotification({
          userId: assignee._id || assignee,
          type: 'attachment_added',
          task,
          board,
          attachment,
          triggeredBy
        });
      }
    } catch (error) {
      console.error('Slack onAttachmentAdded hook error:', error);
    }
  },

  /**
   * Trigger high priority task alert for admins/managers
   */
  async onHighPriorityTask(task, board, triggeredBy) {
    if (!slackNotificationService) return;

    try {
      await slackNotificationService.sendRoleBasedNotification({
        type: 'high_priority_alert',
        task,
        board,
        triggeredBy,
        roles: ['admin', 'manager'],
        urgency: 'urgent'
      });
    } catch (error) {
      console.error('Slack onHighPriorityTask hook error:', error);
    }
  },

  /**
   * Trigger daily digest for a user
   */
  async sendDailyDigest(userId) {
    if (!slackNotificationService) return;

    try {
      await slackNotificationService.sendDigest(userId, 'daily');
    } catch (error) {
      console.error('Slack sendDailyDigest hook error:', error);
    }
  },

  /**
   * Trigger weekly digest for a user
   */
  async sendWeeklyDigest(userId) {
    if (!slackNotificationService) return;

    try {
      await slackNotificationService.sendDigest(userId, 'weekly');
    } catch (error) {
      console.error('Slack sendWeeklyDigest hook error:', error);
    }
  }
};

export default slackHooks;
