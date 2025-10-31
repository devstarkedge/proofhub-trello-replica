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