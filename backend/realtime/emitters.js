/**
 * Socket.IO Emitters
 * 
 * Consolidated emitter functions used by controllers/services to push
 * real-time updates to connected clients. Replaces both the server.js
 * inline emitters and utils/socketEmitter.js.
 * 
 * Usage: import { emitters } from './realtime/emitters.js';
 */

import { ROOM, SUPER_ADMIN_WORKSPACE_STATUS_CHANGED, SUPER_ADMIN_AUDIT_LOG_CREATED } from './events.js';
import { getActiveWorkspaceId } from '../modules/workspaces/workspaceContext.js';

// The Socket.IO server instance — set by socketManager.init()
let _io = null;

/**
 * Set the io instance. Called once by socketManager after initialization.
 */
export const setIO = (io) => {
  _io = io;
};

/**
 * Get the io instance. Throws if not initialized.
 */
export const getIO = () => {
  if (!_io) {
    throw new Error('Socket.IO not initialized. Call socketManager.init() first.');
  }
  return _io;
};

// ─── Generic Emitters ───────────────────────────────────────────────────────

/** Emit notification to a specific user's personal room */
export const emitNotification = (userId, notification) => {
  const io = getIO();
  console.log(`[Socket] Emitting notification to user-${userId}:`, notification?.title || notification?.type);
  io.to(ROOM.user(userId)).emit('notification', notification);
};

/** Emit any event to a specific user */
export const emitToUser = (userId, event, data) => {
  getIO().to(ROOM.user(userId)).emit(event, data);
};

/** Emit any event to a team room */
export const emitToTeam = (teamId, event, data) => {
  getIO().to(ROOM.team(teamId)).emit(event, data);
};

/** Emit any event to a board room */
export const emitToBoard = (boardId, event, data) => {
  getIO().to(ROOM.board(boardId)).emit(event, data);
};

/** Emit any event to all connected clients */
export const emitToAll = (event, data) => {
  getIO().emit(event, data);
};

/** Emit any event to a user's My Shortcuts room */
export const emitToUserShortcuts = (userId, event, data) => {
  getIO().to(ROOM.userShortcuts(userId)).emit(event, data);
};

/** Emit any event to a department room */
export const emitToDepartment = (departmentId, event, data) => {
  getIO().to(ROOM.department(departmentId)).emit(event, data);
};

// ─── Card Emitters ──────────────────────────────────────────────────────────

export const emitCardUpdate = (boardId, cardId, updates, userId, userName) => {
  getIO().to(ROOM.board(boardId)).emit('card-updated', {
    cardId,
    updates,
    updatedBy: { id: userId, name: userName }
  });
};

export const emitCommentAdded = (boardId, cardId, comment) => {
  getIO().to(ROOM.board(boardId)).emit('comment-added', { cardId, comment });
};

export const emitCommentUpdated = (boardId, cardId, commentId, updates) => {
  getIO().to(ROOM.board(boardId)).emit('comment-updated', { cardId, commentId, updates });
};

export const emitCommentDeleted = (boardId, cardId, commentId) => {
  getIO().to(ROOM.board(boardId)).emit('comment-deleted', { cardId, commentId });
};

export const emitSubtaskUpdated = (boardId, cardId, subtaskId, updates) => {
  getIO().to(ROOM.board(boardId)).emit('subtask-updated', { cardId, subtaskId, updates });
};

export const emitAttachmentAdded = (boardId, cardId, attachment) => {
  getIO().to(ROOM.board(boardId)).emit('attachment-added', { cardId, attachment });
};

export const emitAttachmentDeleted = (boardId, cardId, attachmentId) => {
  getIO().to(ROOM.board(boardId)).emit('attachment-deleted', { cardId, attachmentId });
};

export const emitTimeLogged = (boardId, cardId, timeEntry) => {
  getIO().to(ROOM.board(boardId)).emit('time-logged', { cardId, timeEntry });
};

export const emitEstimationUpdated = (boardId, cardId, estimationEntry) => {
  getIO().to(ROOM.board(boardId)).emit('estimation-updated', { cardId, estimationEntry });
};

// ─── User / Department Emitters ─────────────────────────────────────────────

export const emitUserAssigned = (userId, departmentId) => {
  getIO().emit('user-assigned', { userId, departmentId });
};

export const emitUserUnassigned = (userId, departmentId) => {
  getIO().emit('user-unassigned', { userId, departmentId });
};

export const emitBulkUsersAssigned = (userIds, departmentId) => {
  getIO().emit('department-bulk-assigned', {
    userIds,
    departmentId,
    members: userIds,
    count: userIds.length
  });
};

export const emitBulkUsersUnassigned = (userIds, departmentId) => {
  getIO().emit('department-bulk-unassigned', {
    userIds,
    departmentId,
    members: userIds,
    count: userIds.length
  });
};

// ─── Finance Emitters ───────────────────────────────────────────────────────

export const emitFinancePagePending = (page, creatorName) => {
  getIO().to(ROOM.admin).emit('finance:page:pending', {
    page,
    creatorName,
    message: `${creatorName} created a new finance page: "${page.name}" - Pending approval`
  });
};

export const emitFinancePagePublished = (page) => {
  const io = getIO();
  io.to(ROOM.admin).emit('finance:page:published', { page, message: `New finance page "${page.name}" is now available` });
  io.to(ROOM.managers).emit('finance:page:published', { page, message: `New finance page "${page.name}" is now available` });
};

export const emitFinancePageStatusChanged = (page, action) => {
  const io = getIO();
  const message = action === 'approve'
    ? `Finance page "${page.name}" has been approved and is now visible to all managers`
    : `Finance page "${page.name}" was not approved`;

  io.to(ROOM.admin).emit('finance:page:status-changed', { page, action, message });
  io.to(ROOM.managers).emit('finance:page:status-changed', { page, action, message });
};

export const emitFinancePageUpdated = (page) => {
  const io = getIO();
  io.to(ROOM.admin).emit('finance:page:updated', { page, message: `Finance page "${page.name}" has been updated` });
  io.to(ROOM.managers).emit('finance:page:updated', { page, message: `Finance page "${page.name}" has been updated` });
};

export const emitFinancePageDeleted = (pageId, pageName) => {
  const io = getIO();
  io.to(ROOM.admin).emit('finance:page:deleted', { pageId, pageName, message: `Finance page "${pageName}" has been deleted` });
  io.to(ROOM.managers).emit('finance:page:deleted', { pageId, pageName, message: `Finance page "${pageName}" has been deleted` });
};

export const emitFinanceDataRefresh = (context = {}) => {
  const io = getIO();
  const payload = {
    type: 'time_tracking_update',
    timestamp: new Date().toISOString(),
    ...context
  };

  // workspaceId is read from ambient request context rather than requiring
  // every one of this function's ~10 call sites to pass it explicitly —
  // every caller today runs inside a request that already has it.
  const workspaceId = context.workspaceId || getActiveWorkspaceId();
  if (workspaceId) {
    io.to(ROOM.finance(workspaceId)).emit('finance:data:refresh', payload);
  }
  io.to(ROOM.admin).emit('finance:data:refresh', payload);
  io.to(ROOM.managers).emit('finance:data:refresh', payload);
};

// ─── Sales Tab Emitters ─────────────────────────────────────────────────────

/** Broadcast tab created to sales room */
export const emitSalesTabCreated = (tab) => {
  getIO().to(ROOM.sales(tab.workspaceId || getActiveWorkspaceId())).emit('sales:tab:created', { tab });
};

/** Broadcast tab updated to sales room */
export const emitSalesTabUpdated = (tab) => {
  getIO().to(ROOM.sales(tab.workspaceId || getActiveWorkspaceId())).emit('sales:tab:updated', { tab });
};

/** Broadcast tab deleted to sales room */
export const emitSalesTabDeleted = (tabId) => {
  const workspaceId = getActiveWorkspaceId();
  if (!workspaceId) return;
  getIO().to(ROOM.sales(workspaceId)).emit('sales:tab:deleted', { tabId });
};

/** Notify the tab owner that their tab was approved */
export const emitSalesTabApproved = (tab) => {
  getIO().to(ROOM.user(tab.ownerId)).emit('sales:tab:approved', { tab });
  getIO().to(ROOM.sales(tab.workspaceId || getActiveWorkspaceId())).emit('sales:tab:updated', { tab });
};

/** Notify the tab owner that their tab was ignored */
export const emitSalesTabIgnored = (tab) => {
  getIO().to(ROOM.user(tab.ownerId)).emit('sales:tab:ignored', { tab });
};

/** Send watch tab alert to a specific user */
export const emitSalesTabAlert = (userId, alertData) => {
  getIO().to(ROOM.user(userId)).emit('sales:tab:alert', alertData);
};

/** Broadcast unread badge count update to sales room */
export const emitSalesTabUnreadUpdate = (tabId, unreadMatches) => {
  const workspaceId = getActiveWorkspaceId();
  if (!workspaceId) return;
  getIO().to(ROOM.sales(workspaceId)).emit('sales:tab:unread-update', { tabId, unreadMatches });
};

/** Notify admins of a pending shared/public tab */
export const emitSalesTabApprovalPending = (tab) => {
  getIO().to(ROOM.admin).emit('sales:tab:approval-pending', {
    tab,
    message: `New shared Sales ${tab.isWatchTab ? 'Watch ' : ''}Tab "${tab.name}" from ${tab.ownerName} — pending approval`,
  });
};

// ─── Super Admin Dashboard Emitters ─────────────────────────────────────────
// "Core events" scope only — see the Super Admin Dashboard plan for why the
// rest of the dashboard's statistics refetch on demand instead of over sockets.

export const emitSuperAdminWorkspaceStatusChanged = (payload) => {
  getIO().to(ROOM.platformAdmin).emit(SUPER_ADMIN_WORKSPACE_STATUS_CHANGED, payload);
};

export const emitSuperAdminAuditLogCreated = (entry) => {
  getIO().to(ROOM.platformAdmin).emit(SUPER_ADMIN_AUDIT_LOG_CREATED, entry);
};
