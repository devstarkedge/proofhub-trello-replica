/**
 * Socket.IO Event Constants
 * 
 * Single source of truth for all real-time event names.
 * Used by both emitters and the frontend socket bridge.
 */

// ─── Connection ─────────────────────────────────────────────────────────────
export const CONNECTION = 'connection';
export const DISCONNECT = 'disconnect';

// ─── Room Management (Client → Server) ─────────────────────────────────────
export const JOIN_CARD = 'join-card';
export const LEAVE_CARD = 'leave-card';
export const JOIN_TEAM = 'join-team';
export const LEAVE_TEAM = 'leave-team';
export const JOIN_BOARD = 'join-board';
export const LEAVE_BOARD = 'leave-board';
export const JOIN_ANNOUNCEMENTS = 'join-announcements';
export const LEAVE_ANNOUNCEMENTS = 'leave-announcements';
export const JOIN_ANNOUNCEMENT = 'join-announcement';
export const LEAVE_ANNOUNCEMENT = 'leave-announcement';
export const JOIN_FINANCE = 'join-finance';
export const LEAVE_FINANCE = 'leave-finance';
export const JOIN_MY_SHORTCUTS = 'join-my-shortcuts';
export const LEAVE_MY_SHORTCUTS = 'leave-my-shortcuts';
export const JOIN_SALES = 'join-sales';
export const LEAVE_SALES = 'leave-sales';

// ─── Client → Server actions ────────────────────────────────────────────────
export const UPDATE_CARD = 'update-card';
export const ADD_COMMENT = 'add-comment';
export const SUBSCRIBE_PUSH = 'subscribe-push';
export const UNSUBSCRIBE_PUSH = 'unsubscribe-push';

// ─── Server → Client events ────────────────────────────────────────────────
export const CARD_UPDATED = 'card-updated';
export const CARD_CREATED = 'card-created';
export const CARD_DELETED = 'card-deleted';
export const CARD_MOVED = 'card-moved';
export const CARD_COVER_UPDATED = 'card-cover-updated';
export const TASK_COPIED = 'task-copied';
export const TASK_MOVED_CROSS = 'task-moved-cross';

export const COMMENT_ADDED = 'comment-added';
export const COMMENT_UPDATED = 'comment-updated';
export const COMMENT_DELETED = 'comment-deleted';
export const COMMENT_REACTION_ADDED = 'comment-reaction-added';
export const COMMENT_REACTION_REMOVED = 'comment-reaction-removed';
export const COMMENT_PINNED = 'comment-pinned';
export const COMMENT_UNPINNED = 'comment-unpinned';
export const COMMENT_REPLY_ADDED = 'comment-reply-added';

export const HIERARCHY_SUBTASK_CHANGED = 'hierarchy-subtask-changed';
export const HIERARCHY_NANO_CHANGED = 'hierarchy-nano-changed';
export const SUBTASK_COVER_UPDATED = 'subtask-cover-updated';
export const NANO_SUBTASK_COVER_UPDATED = 'nanoSubtask-cover-updated';

export const RECURRENCE_CREATED = 'recurrence-created';
export const RECURRENCE_UPDATED = 'recurrence-updated';
export const RECURRENCE_STOPPED = 'recurrence-stopped';
export const RECURRENCE_TRIGGERED = 'recurrence-triggered';

export const ATTACHMENT_ADDED = 'attachment-added';
export const ATTACHMENT_DELETED = 'attachment-deleted';
export const ATTACHMENT_RESTORED = 'attachment-restored';
export const ATTACHMENT_PERMANENTLY_DELETED = 'attachment-permanently-deleted';

export const TIME_LOGGED = 'time-logged';
export const ESTIMATION_UPDATED = 'estimation-updated';

export const LIST_CREATED = 'list-created';
export const LIST_UPDATED = 'list-updated';
export const LIST_DELETED = 'list-deleted';

export const BOARD_UPDATED = 'board-updated';

export const NOTIFICATION = 'notification';
export const TASK_ASSIGNED = 'task-assigned';

export const USER_VERIFIED = 'user-verified';
export const USER_ASSIGNED = 'user-assigned';
export const USER_UNASSIGNED = 'user-unassigned';
export const DEPARTMENT_BULK_ASSIGNED = 'department-bulk-assigned';
export const DEPARTMENT_BULK_UNASSIGNED = 'department-bulk-unassigned';
export const AVATAR_UPDATED = 'avatar-updated';

// Finance events
export const FINANCE_PAGE_PENDING = 'finance:page:pending';
export const FINANCE_PAGE_PUBLISHED = 'finance:page:published';
export const FINANCE_PAGE_STATUS_CHANGED = 'finance:page:status-changed';
export const FINANCE_PAGE_UPDATED = 'finance:page:updated';
export const FINANCE_PAGE_DELETED = 'finance:page:deleted';
export const FINANCE_DATA_REFRESH = 'finance:data:refresh';

// My Shortcuts events
export const MY_SHORTCUTS_SUMMARY_UPDATED = 'my-shortcuts:summary-updated';
export const MY_SHORTCUTS_NEW_ACTIVITY = 'my-shortcuts:new-activity';
export const MY_SHORTCUTS_TASK_COUNT_CHANGED = 'my-shortcuts:task-count-changed';
export const MY_SHORTCUTS_TIME_LOGGED = 'my-shortcuts:time-logged';
export const MY_SHORTCUTS_ANNOUNCEMENT = 'my-shortcuts:announcement';

// Sales events
export const SALES_ROW_CREATED = 'sales:row:created';
export const SALES_ROW_UPDATED = 'sales:row:updated';
export const SALES_ROW_DELETED = 'sales:row:deleted';
export const SALES_ROWS_BULK_UPDATED = 'sales:rows:bulk-updated';
export const SALES_ROWS_BULK_DELETED = 'sales:rows:bulk-deleted';
export const SALES_ROW_LOCKED = 'sales:row:locked';
export const SALES_ROW_UNLOCKED = 'sales:row:unlocked';
export const SALES_DROPDOWN_UPDATED = 'sales:dropdown:updated';
export const SALES_COLUMN_CREATED = 'sales:column:created';
export const SALES_COLUMN_DELETED = 'sales:column:deleted';
export const SALES_ROWS_IMPORTED = 'sales:rows:imported';
export const SALES_PERMISSIONS_UPDATED = 'sales:permissions:updated';

// Announcement events
export const ANNOUNCEMENT_CREATED = 'announcement-created';
export const ANNOUNCEMENT_UPDATED = 'announcement-updated';
export const ANNOUNCEMENT_DELETED = 'announcement-deleted';
export const ANNOUNCEMENT_ARCHIVED = 'announcement-archived';
export const ANNOUNCEMENT_COMMENT_ADDED = 'announcement-comment-added';
export const ANNOUNCEMENT_COMMENT_DELETED = 'announcement-comment-deleted';
export const ANNOUNCEMENT_REACTION_ADDED = 'announcement-reaction-added';
export const ANNOUNCEMENT_REACTION_REMOVED = 'announcement-reaction-removed';
export const ANNOUNCEMENT_PIN_TOGGLED = 'announcement-pin-toggled';

// ─── Room Prefixes ──────────────────────────────────────────────────────────
export const ROOM = {
  user: (id) => `user-${id}`,
  board: (id) => `board-${id}`,
  card: (id) => `card-${id}`,
  team: (id) => `team-${id}`,
  department: (id) => `department-${id}`,
  announcement: (id) => `announcement-${id}`,
  userShortcuts: (id) => `user-shortcuts-${id}`,
  admin: 'admin',
  managers: 'managers',
  announcements: 'announcements',
  finance: 'finance',
  sales: 'sales',
};
