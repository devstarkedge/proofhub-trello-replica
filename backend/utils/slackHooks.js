/**
 * Slack Integration Hooks
 * Trigger points for sending Slack notifications from controllers.
 *
 * Every hook here is Slack-only (channels: { slack: true, inApp: false }) —
 * the in-app/email/push channel for the same event is already triggered
 * separately by notificationService.notifyXXX() at each call site (unchanged).
 * Routing through NotificationDecisionEngine.evaluateAndDeliverBulk adds,
 * once, for every hook: (a) workspace-membership verification and (b)
 * entity-access verification, on top of the existing, unchanged
 * SlackNotificationService.sendNotification() pipeline (preferences, quiet
 * hours, batching, threading, channel routing, send, record).
 *
 * Bug fixed while rewriting this file: every hook previously read
 * `task.assignedTo`, a field that does not exist on Card (only `assignees`
 * does) — so every task-lifecycle hook resolved an empty recipient list and
 * silently no-op'd. All fixed to `task.assignees`.
 */
import { evaluateAndDeliverBulk } from '../services/notifications/NotificationDecisionEngine.js';
import { slackNotificationService, processDigest } from '../services/slack/index.js';

function resolveWorkspaceId(...docs) {
  for (const doc of docs) {
    if (doc?.workspaceId) return doc.workspaceId;
  }
  return null;
}

/**
 * Task/Card notification hooks
 */
export const slackHooks = {
  /**
   * Trigger when a task is assigned to user(s)
   */
  async onTaskAssigned(task, board, assignees, triggeredBy) {
    const workspaceId = resolveWorkspaceId(task, board);
    if (!workspaceId) {
      console.log('[Slack] onTaskAssigned: no resolvable workspaceId, skipping');
      return;
    }

    console.log(`[Slack] onTaskAssigned triggered for task "${task.title}" to ${assignees?.length || 0} assignees`);

    try {
      await evaluateAndDeliverBulk(assignees, {
        type: 'task_assigned',
        workspaceId,
        actorUserId: triggeredBy?._id,
        entity: { type: 'Card', id: task._id },
        channels: { slack: true, inApp: false },
        slackPayload: {
          task,
          board,
          priority: task?.priority,
          forceImmediate: true // Bypass batching for immediate delivery
        }
      });
      console.log(`[Slack] onTaskAssigned completed for ${assignees?.length || 0} assignees`);
    } catch (error) {
      console.error('Slack onTaskAssigned hook error:', error);
    }
  },

  /**
   * Trigger when a task is updated
   */
  async onTaskUpdated(task, board, changes, triggeredBy) {
    const workspaceId = resolveWorkspaceId(task, board);
    if (!workspaceId) return;

    try {
      const assignees = task.assignees || [];
      await evaluateAndDeliverBulk(assignees, {
        type: 'task_updated',
        workspaceId,
        actorUserId: triggeredBy?._id,
        entity: { type: 'Card', id: task._id },
        channels: { slack: true, inApp: false },
        slackPayload: { task, board, changes, priority: task?.priority }
      });
    } catch (error) {
      console.error('Slack onTaskUpdated hook error:', error);
    }
  },

  /**
   * Trigger when a task status changes
   */
  async onTaskStatusChanged(task, board, oldStatus, newStatus, triggeredBy) {
    const workspaceId = resolveWorkspaceId(task, board);
    if (!workspaceId) return;

    try {
      const assignees = task.assignees || [];
      await evaluateAndDeliverBulk(assignees, {
        type: 'status_change',
        workspaceId,
        actorUserId: triggeredBy?._id,
        entity: { type: 'Card', id: task._id },
        channels: { slack: true, inApp: false },
        slackPayload: { task, board, oldStatus, newStatus, priority: task?.priority }
      });
    } catch (error) {
      console.error('Slack onTaskStatusChanged hook error:', error);
    }
  },

  /**
   * Trigger when a task is completed
   */
  async onTaskCompleted(task, board, triggeredBy) {
    const workspaceId = resolveWorkspaceId(task, board);
    if (!workspaceId) return;

    try {
      // Notify assignees, board owner, and watchers
      const notifyUsers = new Set();
      (task.assignees || []).forEach(a => notifyUsers.add((a._id || a).toString()));
      if (board?.owner) notifyUsers.add((board.owner._id || board.owner).toString());
      (task.watchers || []).forEach(w => notifyUsers.add((w._id || w).toString()));

      await evaluateAndDeliverBulk(Array.from(notifyUsers), {
        type: 'task_completed',
        workspaceId,
        actorUserId: triggeredBy?._id,
        entity: { type: 'Card', id: task._id },
        channels: { slack: true, inApp: false },
        slackPayload: { task, board, priority: task?.priority }
      });
    } catch (error) {
      console.error('Slack onTaskCompleted hook error:', error);
    }
  },

  /**
   * Trigger when a task is deleted
   */
  async onTaskDeleted(task, board, triggeredBy) {
    const workspaceId = resolveWorkspaceId(task, board);
    if (!workspaceId) return;

    try {
      const assignees = task.assignees || [];
      // The card may already be gone by the time this fires — access
      // verification against a deleted entity would always fail, so this
      // event intentionally skips the entity-access check (membership is
      // still verified).
      await evaluateAndDeliverBulk(assignees, {
        type: 'task_deleted',
        workspaceId,
        actorUserId: triggeredBy?._id,
        channels: { slack: true, inApp: false },
        slackPayload: { task, board }
      });
    } catch (error) {
      console.error('Slack onTaskDeleted hook error:', error);
    }
  },

  /**
   * Trigger when a project (board) is updated
   */
  async onProjectUpdated(board, changes, triggeredBy) {
    const workspaceId = resolveWorkspaceId(board);
    if (!workspaceId) return;

    try {
      const members = board.members || [];
      await evaluateAndDeliverBulk(members, {
        type: 'project_updates',
        workspaceId,
        actorUserId: triggeredBy?._id,
        entity: { type: 'Board', id: board._id },
        channels: { slack: true, inApp: false },
        slackPayload: { board, changes }
      });
    } catch (error) {
      console.error('Slack onProjectUpdated hook error:', error);
    }
  },

  /**
   * Trigger when deadline is approaching
   */
  async onDeadlineReminder(task, board, hoursRemaining) {
    const workspaceId = resolveWorkspaceId(task, board);
    if (!workspaceId) return;

    try {
      const assignees = task.assignees || [];
      await evaluateAndDeliverBulk(assignees, {
        type: 'task_due_soon',
        workspaceId,
        entity: { type: 'Card', id: task._id },
        channels: { slack: true, inApp: false },
        slackPayload: { task, board, hoursRemaining, priority: task?.priority }
      });
    } catch (error) {
      console.error('Slack onDeadlineReminder hook error:', error);
    }
  },

  /**
   * Trigger when task becomes overdue
   */
  async onTaskOverdue(task, board) {
    const workspaceId = resolveWorkspaceId(task, board);
    if (!workspaceId) return;

    try {
      const assignees = task.assignees || [];
      await evaluateAndDeliverBulk(assignees, {
        type: 'task_overdue',
        workspaceId,
        entity: { type: 'Card', id: task._id },
        channels: { slack: true, inApp: false },
        slackPayload: { task, board, priority: task?.priority, forceImmediate: true }
      });
    } catch (error) {
      console.error('Slack onTaskOverdue hook error:', error);
    }
  },

  /**
   * Trigger when a comment is added
   */
  async onCommentAdded(comment, task, board, triggeredBy) {
    const workspaceId = resolveWorkspaceId(comment, task, board);
    if (!workspaceId) return;

    try {
      const mentionedIds = (comment.mentions || []).map(m => (m._id || m).toString());
      const mentionedSet = new Set(mentionedIds);
      const assigneeIds = (task.assignees || []).map(a => (a._id || a).toString());
      const nonMentionedAssignees = assigneeIds.filter(id => !mentionedSet.has(id));

      const basePayload = {
        workspaceId,
        actorUserId: triggeredBy?._id,
        entity: { type: 'Comment', id: comment._id },
        channels: { slack: true, inApp: false },
        slackPayload: { task, board, comment }
      };

      await Promise.all([
        mentionedIds.length && evaluateAndDeliverBulk(mentionedIds, { ...basePayload, type: 'comment_mention' }),
        nonMentionedAssignees.length && evaluateAndDeliverBulk(nonMentionedAssignees, { ...basePayload, type: 'comment_added' })
      ]);
    } catch (error) {
      console.error('Slack onCommentAdded hook error:', error);
    }
  },

  /**
   * Trigger when user is mentioned in a comment
   */
  async onMention(userId, comment, task, board, triggeredBy) {
    const workspaceId = resolveWorkspaceId(comment, task, board);
    if (!workspaceId) return;

    try {
      await evaluateAndDeliverBulk([userId], {
        type: 'comment_mention',
        workspaceId,
        actorUserId: triggeredBy?._id,
        entity: { type: 'Comment', id: comment._id },
        channels: { slack: true, inApp: false },
        slackPayload: { task, board, comment, forceImmediate: true }
      });
    } catch (error) {
      console.error('Slack onMention hook error:', error);
    }
  },

  /**
   * Trigger when a subtask is completed
   */
  async onSubtaskCompleted(subtask, task, board, triggeredBy) {
    const workspaceId = resolveWorkspaceId(subtask, task, board);
    if (!workspaceId) return;

    try {
      const assignees = task.assignees || [];
      await evaluateAndDeliverBulk(assignees, {
        type: 'subtask_completed',
        workspaceId,
        actorUserId: triggeredBy?._id,
        entity: { type: 'Card', id: task._id },
        channels: { slack: true, inApp: false },
        slackPayload: { task, board, subtask, priority: task?.priority }
      });
    } catch (error) {
      console.error('Slack onSubtaskCompleted hook error:', error);
    }
  },

  /**
   * Trigger when all subtasks are completed
   */
  async onAllSubtasksCompleted(task, board, triggeredBy) {
    const workspaceId = resolveWorkspaceId(task, board);
    if (!workspaceId) return;

    try {
      const assignees = task.assignees || [];
      await evaluateAndDeliverBulk(assignees, {
        type: 'subtask_completed',
        workspaceId,
        actorUserId: triggeredBy?._id,
        entity: { type: 'Card', id: task._id },
        channels: { slack: true, inApp: false },
        slackPayload: { task, board, priority: task?.priority }
      });
    } catch (error) {
      console.error('Slack onAllSubtasksCompleted hook error:', error);
    }
  },

  /**
   * Trigger for project/board updates
   */
  async onProjectUpdate(board, updateType, triggeredBy) {
    const workspaceId = resolveWorkspaceId(board);
    if (!workspaceId) return;

    try {
      const members = board.members || [];
      await evaluateAndDeliverBulk(members, {
        type: 'project_updates',
        workspaceId,
        actorUserId: triggeredBy?._id,
        entity: { type: 'Board', id: board._id },
        channels: { slack: true, inApp: false },
        slackPayload: { board, updateType }
      });
    } catch (error) {
      console.error('Slack onProjectUpdate hook error:', error);
    }
  },

  /**
   * Trigger when user is added to a team
   */
  async onTeamMemberAdded(team, member, triggeredBy) {
    const workspaceId = resolveWorkspaceId(team);
    if (!workspaceId) return;

    try {
      await evaluateAndDeliverBulk([member], {
        type: 'team_member_added',
        workspaceId,
        actorUserId: triggeredBy?._id,
        channels: { slack: true, inApp: false },
        slackPayload: { team }
      });
    } catch (error) {
      console.error('Slack onTeamMemberAdded hook error:', error);
    }
  },

  /**
   * Trigger when an announcement is posted. Announcement recipient lists
   * are already computed correctly by their own producer (subscriber
   * resolution by audience type), so this bypasses the per-recipient
   * membership/entity-access check and uses the dedicated, already-correct
   * sendAnnouncement (professional Block Kit template, forceImmediate).
   */
  async onAnnouncementPosted(announcement, recipients, triggeredBy) {
    const workspaceId = resolveWorkspaceId(announcement);
    if (!workspaceId) {
      console.log('[Slack] onAnnouncementPosted: no resolvable workspaceId, skipping');
      return;
    }

    try {
      await slackNotificationService.sendAnnouncement(announcement, recipients, triggeredBy, workspaceId);
    } catch (error) {
      console.error('Slack onAnnouncementPosted hook error:', error);
    }
  },

  /**
   * Trigger for custom reminder
   */
  async onReminder(reminder, task, board) {
    const workspaceId = resolveWorkspaceId(reminder, task, board);
    if (!workspaceId) return;

    try {
      await evaluateAndDeliverBulk([reminder.user], {
        type: 'reminder',
        workspaceId,
        channels: { slack: true, inApp: false },
        slackPayload: { task, board, reminder }
      });
    } catch (error) {
      console.error('Slack onReminder hook error:', error);
    }
  },

  /**
   * Trigger when an attachment is added
   */
  async onAttachmentAdded(attachment, task, board, triggeredBy) {
    const workspaceId = resolveWorkspaceId(task, board);
    if (!workspaceId) return;

    try {
      const assignees = task.assignees || [];
      await evaluateAndDeliverBulk(assignees, {
        type: 'task_updated',
        workspaceId,
        actorUserId: triggeredBy?._id,
        entity: { type: 'Card', id: task._id },
        channels: { slack: true, inApp: false },
        slackPayload: { task, board, attachment, customMessage: `New attachment added: ${attachment?.fileName || 'file'}` }
      });
    } catch (error) {
      console.error('Slack onAttachmentAdded hook error:', error);
    }
  },

  /**
   * Trigger high priority task alert for admins/managers
   */
  async onHighPriorityTask(task, board, triggeredBy) {
    const workspaceId = resolveWorkspaceId(task, board);
    if (!workspaceId) return;

    try {
      await slackNotificationService.sendRoleBasedNotification({
        type: 'high_priority_alert',
        workspaceId,
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
   * Trigger daily digest for a user in a specific workspace. Superseded by
   * schedulers/slackDigestScheduler.js's per-(user,workspace) chained
   * delayed job for scheduled digests — kept for any direct/manual trigger
   * use, now pointed at the real processDigest implementation instead of
   * the previously-nonexistent slackNotificationService.sendDigest.
   */
  async sendDailyDigest(slackUserId) {
    try {
      await processDigest({ slackUserId, period: 'daily' });
    } catch (error) {
      console.error('Slack sendDailyDigest hook error:', error);
    }
  },

  /**
   * Trigger weekly digest for a user (see sendDailyDigest note above).
   */
  async sendWeeklyDigest(slackUserId) {
    try {
      await processDigest({ slackUserId, period: 'weekly' });
    } catch (error) {
      console.error('Slack sendWeeklyDigest hook error:', error);
    }
  }
};

export default slackHooks;
