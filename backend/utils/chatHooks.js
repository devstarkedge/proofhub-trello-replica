/**
 * Chat Integration Hooks
 *
 * Trigger points for dispatching webhook events to the Enterprise Chat Application.
 * Mirrors the slackHooks.js pattern — fire-and-forget, called from controllers.
 *
 * Usage in controllers:
 *   chatHooks.onProjectCreated(board, req.user).catch(console.error);
 */

import webhookDispatcher from '../services/chat/webhookDispatcher.js';
import Board from '../models/Board.js';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import {
  buildProjectCreatedPayload,
  buildProjectUpdatedPayload,
  buildProjectDeletedPayload,
  buildProjectMemberPayload,
  buildTaskCreatedPayload,
  buildTaskUpdatedPayload,
  buildTaskDeletedPayload,
  buildTaskAssignedPayload,
  buildTaskUnassignedPayload,
  buildTaskStatusChangedPayload,
  buildTaskDueDateChangedPayload,
  buildCommentAddedPayload,
  buildTimeEntryPayload,
  buildUserPayload,
  buildUserUpdatedPayload,
  buildAnnouncementPayload,
  buildSubtaskEventPayload,
  buildNanoEventPayload,
  buildAttachmentEventPayload,
  buildDepartmentPayload,
  buildDepartmentUpdatedPayload,
} from './chatWebhookPayloads.js';

// ─── Event Constants (must match ChatApp's FLOWTASK_EVENTS) ──────────────────
const EVENTS = {
  PROJECT_CREATED: 'PROJECT_CREATED',
  PROJECT_UPDATED: 'PROJECT_UPDATED',
  PROJECT_DELETED: 'PROJECT_DELETED',
  PROJECT_MEMBER_ADDED: 'PROJECT_MEMBER_ADDED',
  PROJECT_MEMBER_REMOVED: 'PROJECT_MEMBER_REMOVED',
  PROJECT_MEMBER_ASSIGNED: 'PROJECT_MEMBER_ASSIGNED',
  TASK_CREATED: 'TASK_CREATED',
  TASK_UPDATED: 'TASK_UPDATED',
  TASK_DELETED: 'TASK_DELETED',
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_UNASSIGNED: 'TASK_UNASSIGNED',
  TASK_STATUS_CHANGED: 'TASK_STATUS_CHANGED',
  TASK_DUE_DATE_CHANGED: 'TASK_DUE_DATE_CHANGED',
  TASK_COMMENT_ADDED: 'TASK_COMMENTED',
  TIME_ENTRY_ADDED: 'TIME_ENTRY_ADDED',
  TIME_ENTRY_UPDATED: 'TIME_ENTRY_UPDATED',
  TIME_ENTRY_DELETED: 'TIME_ENTRY_DELETED',
  // Type-specific time entry events
  LOGGED_TIME_ADDED: 'LOGGED_TIME_ADDED',
  LOGGED_TIME_UPDATED: 'LOGGED_TIME_UPDATED',
  LOGGED_TIME_DELETED: 'LOGGED_TIME_DELETED',
  ESTIMATED_TIME_ADDED: 'ESTIMATED_TIME_ADDED',
  ESTIMATED_TIME_UPDATED: 'ESTIMATED_TIME_UPDATED',
  ESTIMATED_TIME_DELETED: 'ESTIMATED_TIME_DELETED',
  USER_REGISTERED: 'USER_REGISTERED',
  USER_VERIFIED: 'USER_VERIFIED',
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  ANNOUNCEMENT_CREATED: 'ANNOUNCEMENT_CREATED',
  ANNOUNCEMENT_DELETED: 'ANNOUNCEMENT_DELETED',
  ANNOUNCEMENT_UPDATED: 'ANNOUNCEMENT_UPDATED',
  SUBTASK_CREATED: 'SUBTASK_CREATED',
  SUBTASK_UPDATED: 'SUBTASK_UPDATED',
  SUBTASK_COMPLETED: 'SUBTASK_COMPLETED',
  SUBTASK_DELETED: 'SUBTASK_DELETED',
  NANO_CREATED: 'NANO_CREATED',
  NANO_COMPLETED: 'NANO_COMPLETED',
  NANO_DELETED: 'NANO_DELETED',
  ATTACHMENT_ADDED: 'ATTACHMENT_ADDED',
  DEPARTMENT_CREATED: 'DEPARTMENT_CREATED',
  DEPARTMENT_UPDATED: 'DEPARTMENT_UPDATED',
  DEPARTMENT_DELETED: 'DEPARTMENT_DELETED',
};

export const chatHooks = {
  // ─── Project / Board Hooks ───────────────────────────────────────────────

  /**
   * Trigger when a project/board is created.
   * @param {object} board - Board Mongoose document
   * @param {object} actor - req.user
   */
  async onProjectCreated(board, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildProjectCreatedPayload(board, actor);
    await webhookDispatcher.dispatch(EVENTS.PROJECT_CREATED, payload);
  },

  /**
   * Trigger when a project/board is updated.
   * @param {object} board - Updated board document
   * @param {object} changes - Object describing what changed
   * @param {object} actor - req.user
   */
  async onProjectUpdated(board, changes, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildProjectUpdatedPayload(board, changes, actor);
    await webhookDispatcher.dispatch(EVENTS.PROJECT_UPDATED, payload);
  },

  /**
   * Trigger when a project/board is deleted.
   * @param {object} board - Deleted board document
   * @param {object} actor - req.user
   */
  async onProjectDeleted(board, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildProjectDeletedPayload(board, actor);
    await webhookDispatcher.dispatch(EVENTS.PROJECT_DELETED, payload);
  },

  /**
   * Trigger when a member is added to a project.
   * @param {object} board - Board document
   * @param {object|string} member - User document or userId
   * @param {object} actor - req.user
   */
  async onProjectMemberAdded(board, member, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildProjectMemberPayload(board, member, 'member', actor);
    await webhookDispatcher.dispatch(EVENTS.PROJECT_MEMBER_ADDED, payload);
  },

  /**
   * Trigger when a member is removed from a project.
   * @param {object} board - Board document
   * @param {object|string} member - User document or userId
   * @param {object} actor - req.user
   */
  async onProjectMemberRemoved(board, member, actor) {
    if (!webhookDispatcher.isEnabled()) return;

    const memberId = (member?._id || member)?.toString();
    const boardId = (board?._id || board?.id)?.toString();

    // Check if removed member still has active task/subtask/nano assignments
    let hasActiveTasks = false;
    if (memberId && boardId) {
      try {
        const [cardCount, subtaskCount, nanoCount] = await Promise.all([
          Card.countDocuments({ board: boardId, assignees: memberId, isArchived: { $ne: true } }),
          Subtask.countDocuments({ board: boardId, assignees: memberId, status: { $nin: ['done', 'closed'] } }),
          SubtaskNano.countDocuments({ board: boardId, assignees: memberId, status: { $nin: ['done', 'closed'] } }),
        ]);
        hasActiveTasks = (cardCount + subtaskCount + nanoCount) > 0;
      } catch (err) {
        // If check fails, default to keeping the user (safe fallback)
        hasActiveTasks = true;
      }
    }

    const payload = buildProjectMemberPayload(board, member, 'removed', actor);
    payload.hasActiveTasks = hasActiveTasks;
    await webhookDispatcher.dispatch(EVENTS.PROJECT_MEMBER_REMOVED, payload);
  },

  /**
   * Trigger when a member is assigned a role in a project.
   * @param {object} board - Board document
   * @param {object|string} member - User document or userId
   * @param {string} role - Assigned role
   * @param {object} actor - req.user
   */
  async onProjectMemberAssigned(board, member, role, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildProjectMemberPayload(board, member, role, actor);
    await webhookDispatcher.dispatch(EVENTS.PROJECT_MEMBER_ASSIGNED, payload);
  },

  // ─── Task / Card Hooks ───────────────────────────────────────────────────

  /**
   * Trigger when a task/card is created.
   * @param {object} card - Card Mongoose document
   * @param {object} board - Board context
   * @param {object} actor - req.user
   */
  async onTaskCreated(card, board, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildTaskCreatedPayload(card, board, actor);
    await webhookDispatcher.dispatch(EVENTS.TASK_CREATED, payload);
  },

  /**
   * Trigger when a task/card is updated.
   * @param {object} card - Updated card document
   * @param {object} changes - What changed (status, priority, title, etc.)
   * @param {object} board - Board context
   * @param {object} actor - req.user
   */
  async onTaskUpdated(card, changes, board, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildTaskUpdatedPayload(card, changes, board, actor);
    await webhookDispatcher.dispatch(EVENTS.TASK_UPDATED, payload);
  },

  /**
   * Trigger when a task/card is deleted.
   * @param {object} card - Deleted card document
   * @param {object} board - Board context
   * @param {object} actor - req.user
   */
  async onTaskDeleted(card, board, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildTaskDeletedPayload(card, board, actor);
    await webhookDispatcher.dispatch(EVENTS.TASK_DELETED, payload);
  },

  /**
   * Trigger when users are assigned to a task.
   * @param {object} card - Card document
   * @param {Array} assignees - Array of user objects or IDs
   * @param {object} board - Board context
   * @param {object} actor - req.user
   */
  async onTaskAssigned(card, assignees, board, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildTaskAssignedPayload(card, assignees, board, actor);
    await webhookDispatcher.dispatch(EVENTS.TASK_ASSIGNED, payload);
  },

  /**
   * Trigger when users are unassigned from a task.
   * Checks if each removed user still has other active tasks in the board.
   * @param {object} card - Card document
   * @param {Array} removedUserIds - Array of user IDs that were unassigned
   * @param {object} board - Board context
   * @param {object} actor - req.user
   */
  async onTaskUnassigned(card, removedUserIds, board, actor) {
    if (!webhookDispatcher.isEnabled()) return;

    const boardId = (board?._id || board?.id || card.board)?.toString();
    const activeTaskFlags = {};

    // For each removed user, check if they still have other assignments in this board
    for (const userId of removedUserIds) {
      const uid = (userId._id || userId).toString();
      try {
        // Check other cards (exclude current card), subtasks, and nanos
        const [otherCardCount, subtaskCount, nanoCount] = await Promise.all([
          Card.countDocuments({ board: boardId, assignees: uid, _id: { $ne: card._id }, isArchived: { $ne: true } }),
          Subtask.countDocuments({ board: boardId, assignees: uid, status: { $nin: ['done', 'closed'] } }),
          SubtaskNano.countDocuments({ board: boardId, assignees: uid, status: { $nin: ['done', 'closed'] } }),
        ]);

        // Also check if user is a direct board member (owner/member)
        const boardDoc = await Board.findById(boardId).select('owner members').lean();
        const isBoardMember = boardDoc && (
          boardDoc.owner?.toString() === uid ||
          (boardDoc.members || []).some((m) => (m._id || m).toString() === uid)
        );

        activeTaskFlags[uid] = isBoardMember || (otherCardCount + subtaskCount + nanoCount) > 0;
      } catch (err) {
        // If check fails, default to keeping the user (safe fallback)
        activeTaskFlags[uid] = true;
      }
    }

    const payload = buildTaskUnassignedPayload(card, removedUserIds, board, actor, activeTaskFlags);
    await webhookDispatcher.dispatch(EVENTS.TASK_UNASSIGNED, payload);
  },

  /**
   * Trigger when a task status changes (list move or explicit status update).
   * @param {object} card - Card document
   * @param {string} oldStatus - Previous status
   * @param {string} newStatus - New status
   * @param {object} board - Board context
   * @param {object} actor - req.user
   */
  async onTaskStatusChanged(card, oldStatus, newStatus, board, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildTaskStatusChangedPayload(card, oldStatus, newStatus, board, actor);
    await webhookDispatcher.dispatch(EVENTS.TASK_STATUS_CHANGED, payload);
  },

  /**
   * Trigger when a task due date changes.
   * @param {object} card - Card document
   * @param {string|Date} oldDate - Previous due date
   * @param {string|Date} newDate - New due date
   * @param {object} board - Board context
   * @param {object} actor - req.user
   */
  async onTaskDueDateChanged(card, oldDate, newDate, board, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildTaskDueDateChangedPayload(card, oldDate, newDate, board, actor);
    await webhookDispatcher.dispatch(EVENTS.TASK_DUE_DATE_CHANGED, payload);
  },

  // ─── Comment Hooks ─────────────────────────────────────────────────────

  /**
   * Trigger when a comment is added to a task.
   * @param {object} comment - Comment document
   * @param {object} card - Parent card
   * @param {object} board - Board context
   * @param {object} actor - req.user
   */
  async onCommentAdded(comment, card, board, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildCommentAddedPayload(comment, card, board, actor);
    await webhookDispatcher.dispatch(EVENTS.TASK_COMMENT_ADDED, payload);
  },

  // ─── Time Entry Hooks ──────────────────────────────────────────────────

  /**
   * Resolve the type-specific event name for a time entry operation.
   * Falls back to the legacy TIME_ENTRY_* event if entryType is unknown.
   */
  _resolveTimeEventName(entryType, operation) {
    const typeKey = entryType === 'logged'
      ? 'LOGGED_TIME'
      : entryType === 'estimation'
        ? 'ESTIMATED_TIME'
        : entryType === 'billed'
          ? 'BILLED_TIME'
          : null;

    if (!typeKey) {
      // Fallback to legacy generic event
      const legacyKey = `TIME_ENTRY_${operation.toUpperCase()}`;
      return EVENTS[legacyKey] || EVENTS.TIME_ENTRY_ADDED;
    }

    const opKey = operation === 'updated' ? 'UPDATED' : operation === 'deleted' ? 'DELETED' : 'ADDED';
    return EVENTS[`${typeKey}_${opKey}`];
  },

  /**
   * Trigger when a time entry is added.
   * Accepts the legacy (card, entry, board, actor) signature for task logged time
   * and the newer structured payload used for task/subtask/nano time events.
   * Dispatches only the type-specific event (LOGGED_TIME_ADDED etc.) to prevent
   * duplicate messages in the connected chat channel.
   */
  async onTimeEntryAdded(contextOrCard, entry, board, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildTimeEntryPayload(contextOrCard, entry, board, actor);
    const typedEvent = this._resolveTimeEventName(payload.entryType, 'added');
    await webhookDispatcher.dispatch(typedEvent, payload);
  },

  /**
   * Trigger when a time entry is updated.
   * @param {object} context - Structured time-event context
   */
  async onTimeEntryUpdated(context) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildTimeEntryPayload({ ...(context || {}), operation: 'updated' });
    const typedEvent = this._resolveTimeEventName(payload.entryType, 'updated');
    await webhookDispatcher.dispatch(typedEvent, payload);
  },

  /**
   * Trigger when a time entry is deleted.
   * @param {object} context - Structured time-event context
   */
  async onTimeEntryDeleted(context) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildTimeEntryPayload({ ...(context || {}), operation: 'deleted' });
    const typedEvent = this._resolveTimeEventName(payload.entryType, 'deleted');
    await webhookDispatcher.dispatch(typedEvent, payload);
  },

  // ─── User Hooks ────────────────────────────────────────────────────────

  /**
   * Trigger when a user registers.
   * @param {object} user - User document
   */
  async onUserRegistered(user) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildUserPayload(user, 'USER_REGISTERED');
    await webhookDispatcher.dispatch(EVENTS.USER_REGISTERED, payload);
  },

  /**
   * Trigger when a user is verified by admin.
   * @param {object} user - User document
   */
  async onUserVerified(user) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildUserPayload(user, 'USER_VERIFIED');
    await webhookDispatcher.dispatch(EVENTS.USER_VERIFIED, payload);
  },

  /**
   * Trigger when a admin creates a user.
   * @param {object} user - User document
   */
  async onUserCreated(user) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildUserPayload(user, 'USER_CREATED');
    await webhookDispatcher.dispatch(EVENTS.USER_CREATED, payload);
  },

  /**
   * Trigger when a user profile is updated (role/department change, etc.)
   * @param {object} user - Updated user document
   * @param {object} changes - What changed
   * @param {object} [actor] - Who made the change (admin/self)
   */
  async onUserUpdated(user, changes, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildUserUpdatedPayload(user, changes, actor);
    await webhookDispatcher.dispatch(EVENTS.USER_UPDATED, payload);
  },

  /**
   * Trigger when a user is deactivated/deleted.
   * @param {object} user - User document
   */
  async onUserDeactivated(user) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildUserPayload(user, 'USER_DEACTIVATED');
    await webhookDispatcher.dispatch(EVENTS.USER_DEACTIVATED, payload);
  },

  // ─── Announcement Hooks ────────────────────────────────────────────────

  /**
   * Trigger when an announcement is created.
   * @param {object} announcement - Announcement document
   * @param {object} actor - req.user
   */
  async onAnnouncementCreated(announcement, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildAnnouncementPayload(announcement, actor);
    await webhookDispatcher.dispatch(EVENTS.ANNOUNCEMENT_CREATED, payload);
  },

  async onAnnouncementDeleted(announcement, actor) {
    if (!webhookDispatcher.isEnabled()) return;

    const base = buildAnnouncementPayload(announcement, actor);
    const payload = {
      ...base,
      deletedBy: (actor?._id || actor?.id)?.toString() || null,
      deletedAt: new Date().toISOString(),
      syncVersion: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    };

    await webhookDispatcher.dispatch(
      EVENTS.ANNOUNCEMENT_DELETED,
      payload
    );
  },

  async onAnnouncementUpdated(announcement, actor) {
    if (!webhookDispatcher.isEnabled()) return;

    const payload = buildAnnouncementPayload(announcement, actor);

    await webhookDispatcher.dispatch(
      EVENTS.ANNOUNCEMENT_UPDATED,
      payload
    );
  },

  // ─── Subtask Hooks ─────────────────────────────────────────────────────

  async onSubtaskCreated(subtask, card, board, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    // Ensure board object includes department when possible
    try {
      if (!board || board.department === undefined) {
        const boardId = (board && (board._id || board.id)) || (card && (card.board || card._id));
        if (boardId) {
          const b = await Board.findById(boardId).select('name department').lean();
          if (b) board = b;
        }
      }
    } catch (e) {
      // ignore enrichment errors
    }
    const payload = buildSubtaskEventPayload(subtask, card, board, actor, 'SUBTASK_CREATED');
    await webhookDispatcher.dispatch(EVENTS.SUBTASK_CREATED, payload);
  },

  async onSubtaskCompleted(subtask, card, board, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    try {
      if (!board || board.department === undefined) {
        const boardId = (board && (board._id || board.id)) || (card && (card.board || card._id));
        if (boardId) {
          const b = await Board.findById(boardId).select('name department').lean();
          if (b) board = b;
        }
      }
    } catch (e) {}
    const payload = buildSubtaskEventPayload(subtask, card, board, actor, 'SUBTASK_COMPLETED');
    await webhookDispatcher.dispatch(EVENTS.SUBTASK_COMPLETED, payload);
  },

  async onSubtaskUpdated(subtask, card, board, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    try {
      if (!board || board.department === undefined) {
        const boardId = (board && (board._id || board.id)) || (card && (card.board || card._id));
        if (boardId) {
          const b = await Board.findById(boardId).select('name department').lean();
          if (b) board = b;
        }
      }
    } catch (e) {}
    const payload = buildSubtaskEventPayload(subtask, card, board, actor, 'SUBTASK_UPDATED');
    await webhookDispatcher.dispatch(EVENTS.SUBTASK_UPDATED, payload);
  },

  async onSubtaskDeleted(subtask, card, board, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildSubtaskEventPayload(subtask, card, board, actor, 'SUBTASK_DELETED');
    await webhookDispatcher.dispatch(EVENTS.SUBTASK_DELETED, payload);
  },

  // ─── Nano Subtask Hooks ────────────────────────────────────────────────

  async onNanoCreated(nano, subtask, card, board, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildNanoEventPayload(nano, subtask, card, board, actor, 'NANO_CREATED');
    await webhookDispatcher.dispatch(EVENTS.NANO_CREATED, payload);
  },

  async onNanoCompleted(nano, subtask, card, board, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildNanoEventPayload(nano, subtask, card, board, actor, 'NANO_COMPLETED');
    await webhookDispatcher.dispatch(EVENTS.NANO_COMPLETED, payload);
  },

  async onNanoDeleted(nano, subtask, card, board, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildNanoEventPayload(nano, subtask, card, board, actor, 'NANO_DELETED');
    await webhookDispatcher.dispatch(EVENTS.NANO_DELETED, payload);
  },

  // ─── Attachment Hooks ──────────────────────────────────────────────────

  async onAttachmentAdded(attachment, card, board, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    try {
      if (!board || board.department === undefined) {
        const boardId = (board && (board._id || board.id)) || (card && (card.board || card._id));
        if (boardId) {
          const b = await Board.findById(boardId).select('name department').lean();
          if (b) board = b;
        }
      }
    } catch (e) {}
    const payload = buildAttachmentEventPayload(attachment, card, board, actor);
    await webhookDispatcher.dispatch(EVENTS.ATTACHMENT_ADDED, payload);
  },

  // ─── Department Hooks ────────────────────────────────────────────────────

  async onDepartmentCreated(department, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildDepartmentPayload(department, 'DEPARTMENT_CREATED', actor);
    await webhookDispatcher.dispatch(EVENTS.DEPARTMENT_CREATED, payload);
  },

  async onDepartmentUpdated(department, changes, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildDepartmentUpdatedPayload(department, changes, actor);
    await webhookDispatcher.dispatch(EVENTS.DEPARTMENT_UPDATED, payload);
  },

  async onDepartmentDeleted(department, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildDepartmentPayload(department, 'DEPARTMENT_DELETED', actor);
    await webhookDispatcher.dispatch(EVENTS.DEPARTMENT_DELETED, payload);
  }
};

export default chatHooks;
