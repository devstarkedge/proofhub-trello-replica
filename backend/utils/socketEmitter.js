import { io } from '../server.js';

export const emitCardUpdate = (boardId, cardId, updates, userId, userName) => {
  io.to(`board-${boardId}`).emit('card-updated', {
    cardId,
    updates,
    updatedBy: { id: userId, name: userName }
  });
};

export const emitCommentAdded = (boardId, cardId, comment) => {
  io.to(`board-${boardId}`).emit('comment-added', { cardId, comment });
};

export const emitCommentUpdated = (boardId, cardId, commentId, updates) => {
  io.to(`board-${boardId}`).emit('comment-updated', { cardId, commentId, updates });
};

export const emitCommentDeleted = (boardId, cardId, commentId) => {
  io.to(`board-${boardId}`).emit('comment-deleted', { cardId, commentId });
};

export const emitSubtaskUpdated = (boardId, cardId, subtaskId, updates) => {
  io.to(`board-${boardId}`).emit('subtask-updated', { cardId, subtaskId, updates });
};

export const emitAttachmentAdded = (boardId, cardId, attachment) => {
  io.to(`board-${boardId}`).emit('attachment-added', { cardId, attachment });
};

export const emitAttachmentDeleted = (boardId, cardId, attachmentId) => {
  io.to(`board-${boardId}`).emit('attachment-deleted', { cardId, attachmentId });
};

export const emitTimeLogged = (boardId, cardId, timeEntry) => {
  io.to(`board-${boardId}`).emit('time-logged', { cardId, timeEntry });
};

export const emitEstimationUpdated = (boardId, cardId, estimationEntry) => {
  io.to(`board-${boardId}`).emit('estimation-updated', { cardId, estimationEntry });
};

export const emitUserAssigned = (userId, departmentId) => {
  io.emit('user-assigned', { userId, departmentId });
};

export const emitUserUnassigned = (userId, departmentId) => {
  io.emit('user-unassigned', { userId, departmentId });
};

export const emitBulkUsersAssigned = (userIds, departmentId) => {
  io.emit('department-bulk-assigned', {
    userIds,
    departmentId,
    members: userIds,
    count: userIds.length
  });
};

export const emitBulkUsersUnassigned = (userIds, departmentId) => {
  io.emit('department-bulk-unassigned', {
    userIds,
    departmentId,
    members: userIds,
    count: userIds.length
  });
};

// ============================================
// Finance Page Socket Emitters
// ============================================

/**
 * Emit finance page pending approval event (to admin/manager rooms)
 */
export const emitFinancePagePending = (page, creatorName) => {
  io.to('admin').emit('finance:page:pending', {
    page,
    creatorName,
    message: `${creatorName} created a new finance page: "${page.name}" - Pending approval`
  });
};

/**
 * Emit finance page published event
 */
export const emitFinancePagePublished = (page) => {
  io.to('admin').emit('finance:page:published', { page, message: `New finance page "${page.name}" is now available` });
  io.to('manager').emit('finance:page:published', { page, message: `New finance page "${page.name}" is now available` });
};

/**
 * Emit finance page status change (approved/rejected)
 */
export const emitFinancePageStatusChanged = (page, action) => {
  const message = action === 'approve' 
    ? `Finance page "${page.name}" has been approved and is now visible to all managers`
    : `Finance page "${page.name}" was not approved`;
  
  io.to('admin').emit('finance:page:status-changed', { page, action, message });
  io.to('manager').emit('finance:page:status-changed', { page, action, message });
};

/**
 * Emit finance page updated event
 */
export const emitFinancePageUpdated = (page) => {
  io.to('admin').emit('finance:page:updated', { page, message: `Finance page "${page.name}" has been updated` });
  io.to('manager').emit('finance:page:updated', { page, message: `Finance page "${page.name}" has been updated` });
};

/**
 * Emit finance page deleted event
 */
export const emitFinancePageDeleted = (pageId, pageName) => {
  io.to('admin').emit('finance:page:deleted', { pageId, pageName, message: `Finance page "${pageName}" has been deleted` });
  io.to('manager').emit('finance:page:deleted', { pageId, pageName, message: `Finance page "${pageName}" has been deleted` });
};

// ============================================
// Finance Data Real-Time Updates
// ============================================

/**
 * Emit finance data refresh event when time tracking data changes
 * Notifies all users in the finance room to refresh their data
 * Called when loggedTime or billedTime is updated on cards, subtasks, or nano-subtasks
 * 
 * @param {Object} context - Contextual information about the change
 * @param {string} context.changeType - Type of change: 'logged_time' or 'billed_time'
 * @param {string} [context.cardId] - ID of the affected card
 * @param {string} [context.subtaskId] - ID of the affected subtask
 * @param {string} [context.nanoId] - ID of the affected nano-subtask
 * @param {string} [context.boardId] - ID of the project/board
 */
export const emitFinanceDataRefresh = (context = {}) => {
  const payload = {
    type: 'time_tracking_update',
    timestamp: new Date().toISOString(),
    ...context
  };
  
  // Emit to finance room (for dashboard viewers)
  io.to('finance').emit('finance:data:refresh', payload);
  
  // Also emit to admin and manager rooms (they may have dashboards open)
  io.to('admin').emit('finance:data:refresh', payload);
  io.to('manager').emit('finance:data:refresh', payload);
};
