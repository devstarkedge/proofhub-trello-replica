/**
 * Realtime Module Entry Point
 * 
 * Re-exports socketManager, emitters, and events for convenient importing.
 */

export { default as socketManager } from './socketManager.js';
export {
  emitNotification,
  emitToUser,
  emitToTeam,
  emitToBoard,
  emitToAll,
  emitToUserShortcuts,
  emitToDepartment,
  emitCardUpdate,
  emitCommentAdded,
  emitCommentUpdated,
  emitCommentDeleted,
  emitSubtaskUpdated,
  emitAttachmentAdded,
  emitAttachmentDeleted,
  emitTimeLogged,
  emitEstimationUpdated,
  emitUserAssigned,
  emitUserUnassigned,
  emitBulkUsersAssigned,
  emitBulkUsersUnassigned,
  emitFinancePagePending,
  emitFinancePagePublished,
  emitFinancePageStatusChanged,
  emitFinancePageUpdated,
  emitFinancePageDeleted,
  emitFinanceDataRefresh,
  getIO,
  setIO,
} from './emitters.js';
export * from './events.js';
