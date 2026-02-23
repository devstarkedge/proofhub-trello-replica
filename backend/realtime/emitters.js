/**
 * Socket.IO Emitters
 * 
 * Consolidated emitter functions used by controllers/services to push
 * real-time updates to connected clients. Replaces both the server.js
 * inline emitters and utils/socketEmitter.js.
 * 
 * Usage: import { emitters } from './realtime/emitters.js';
 */

import { ROOM } from './events.js';

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

  io.to(ROOM.finance).emit('finance:data:refresh', payload);
  io.to(ROOM.admin).emit('finance:data:refresh', payload);
  io.to(ROOM.managers).emit('finance:data:refresh', payload);
};
