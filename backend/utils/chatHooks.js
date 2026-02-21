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
import {
  buildProjectCreatedPayload,
  buildProjectUpdatedPayload,
  buildProjectDeletedPayload,
  buildProjectMemberPayload,
  buildTaskCreatedPayload,
  buildTaskUpdatedPayload,
  buildTaskDeletedPayload,
  buildTaskAssignedPayload,
  buildTaskStatusChangedPayload,
  buildTaskDueDateChangedPayload,
  buildCommentAddedPayload,
  buildTimeEntryPayload,
  buildUserPayload,
  buildUserUpdatedPayload,
  buildAnnouncementPayload,
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
  TASK_STATUS_CHANGED: 'TASK_STATUS_CHANGED',
  TASK_DUE_DATE_CHANGED: 'TASK_DUE_DATE_CHANGED',
  TASK_COMMENT_ADDED: 'TASK_COMMENT_ADDED',
  TIME_ENTRY_ADDED: 'TIME_ENTRY_ADDED',
  USER_REGISTERED: 'USER_REGISTERED',
  USER_VERIFIED: 'USER_VERIFIED',
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  ANNOUNCEMENT_CREATED: 'ANNOUNCEMENT_CREATED',
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
    const payload = buildProjectMemberPayload(board, member, 'removed', actor);
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
   * Trigger when time is logged on a task.
   * @param {object} card - Card document
   * @param {object} entry - Time entry { hours, minutes, description }
   * @param {object} board - Board context
   * @param {object} actor - req.user
   */
  async onTimeEntryAdded(card, entry, board, actor) {
    if (!webhookDispatcher.isEnabled()) return;
    const payload = buildTimeEntryPayload(card, entry, board, actor);
    await webhookDispatcher.dispatch(EVENTS.TIME_ENTRY_ADDED, payload);
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
};

export default chatHooks;
