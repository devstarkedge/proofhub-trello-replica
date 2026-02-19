import { clearMultipleCachePatterns, clearCacheByPattern, deleteCache } from './redisCache.js';
import { invalidateCache } from '../middleware/cache.js';

const ensureString = (id) => {
  if (!id) return null;
  if (typeof id === 'string') return id;
  // Handle Mongoose ObjectId (has toHexString)
  if (typeof id.toHexString === 'function') return id.toHexString();
  // Handle populated Mongoose documents — extract _id
  if (id._id) return ensureString(id._id);
  // Fallback — but reject absurdly long results (indicates a serialized object)
  const str = String(id);
  return str.length <= 50 ? str : null;
};

// ============================================
// HIERARCHY CACHE INVALIDATION
// ============================================

/**
 * Invalidate all caches related to a board/list/card/subtask hierarchy.
 * Clears user-scoped caches for ALL users (wildcard on user segment).
 */
export const invalidateHierarchyCache = ({
  boardId,
  listId,
  cardId,
  subtaskId,
  subtaskNanoId
}) => {
  const board = ensureString(boardId);
  const list = ensureString(listId);
  const card = ensureString(cardId);
  const subtask = ensureString(subtaskId);
  const nano = ensureString(subtaskNanoId);

  const patterns = [];

  if (board) {
    patterns.push(
      `cache:boards:*${board}*`,
      `cache:workflow:*${board}*`,
      `cache:cards:*board/${board}*`,
      `cache:lists:*${board}*`
    );
  }

  if (list) {
    patterns.push(
      `cache:lists:*${list}*`,
      `cache:cards:*list/${list}*`
    );
  }

  if (card) {
    patterns.push(
      `cache:cards:*${card}*`,
      `cache:subtasks:*task/${card}*`
    );
  }

  if (subtask) {
    patterns.push(
      `cache:subtasks:*${subtask}*`,
      `cache:subtask-nanos:*subtask/${subtask}*`
    );
  }

  if (nano) {
    patterns.push(`cache:subtask-nanos:*${nano}*`);
  }

  // Also invalidate analytics and finance caches (they depend on card/board data)
  if (board || card) {
    patterns.push(
      'cache:analytics:*',
      'cache:team-analytics:*',
      'cache:calendar:*',
      'cache:pm-sheet:*'
    );
  }

  if (patterns.length > 0) {
    clearMultipleCachePatterns(patterns).catch(() => {});
  }
};

// ============================================
// ANNOUNCEMENT CACHE INVALIDATION
// ============================================

export const invalidateAnnouncementCache = ({ announcementId, clearAll = false }) => {
  const patterns = ['cache:announcements:*'];

  if (!clearAll && announcementId) {
    const id = ensureString(announcementId);
    if (id) {
      patterns.push(`cache:announcements:*${id}*`);
    }
  }

  clearMultipleCachePatterns(patterns).catch(() => {});
};

// ============================================
// RECURRENCE CACHE INVALIDATION
// ============================================

export const invalidateRecurrenceCache = ({ boardId, cardId, recurrenceId }) => {
  const board = ensureString(boardId);
  const card = ensureString(cardId);
  const recurrence = ensureString(recurrenceId);
  const patterns = [];

  if (board) {
    patterns.push(`cache:*recurrence*${board}*`);
  }

  if (card) {
    patterns.push(
      `cache:*recurrence*${card}*`,
      `cache:subtasks:*task/${card}*`
    );
  }

  if (recurrence) {
    patterns.push(`cache:*recurrence*${recurrence}*`);
  }

  if (patterns.length > 0) {
    clearMultipleCachePatterns(patterns).catch(() => {});
  }
};

// ============================================
// USER SESSION CACHE INVALIDATION
// ============================================

/**
 * Invalidate a user's session cache (used by protect middleware)
 * and all user-scoped route caches.
 * Call after: profile update, role change, deactivation, avatar change.
 * @param {string} userId
 */
export const invalidateUserCache = (userId) => {
  const id = ensureString(userId);
  if (!id) return;

  // Clear session cache
  deleteCache(`user-session:${id}`).catch(() => {});
  // Clear all user-scoped route caches
  clearCacheByPattern(`cache:*:user:${id}:*`).catch(() => {});
  // Clear user-related caches
  clearCacheByPattern(`cache:users:*`).catch(() => {});
};

// ============================================
// DEPARTMENT CACHE INVALIDATION
// ============================================

export const invalidateDepartmentCache = (departmentId) => {
  const patterns = ['cache:departments:*'];
  if (departmentId) {
    const id = ensureString(departmentId);
    patterns.push(`cache:departments:*${id}*`);
  }
  // Department changes affect boards and analytics
  patterns.push('cache:boards:*', 'cache:analytics:*');
  clearMultipleCachePatterns(patterns).catch(() => {});
};

// ============================================
// FINANCE CACHE INVALIDATION
// ============================================

export const invalidateFinanceCache = () => {
  clearCacheByPattern('cache:finance:*').catch(() => {});
};

// ============================================
// TEAM ANALYTICS CACHE INVALIDATION
// ============================================

export const invalidateTeamAnalyticsCache = () => {
  clearMultipleCachePatterns([
    'cache:team-analytics:*',
    'cache:analytics:*',
    'cache:pm-sheet:*'
  ]).catch(() => {});
};

// ============================================
// NOTIFICATION CACHE INVALIDATION
// ============================================

export const invalidateNotificationCache = (userId) => {
  const id = ensureString(userId);
  if (id) {
    clearCacheByPattern(`cache:notifications:*:user:${id}:*`).catch(() => {});
  }
};

// ============================================
// LABEL & CATEGORY CACHE INVALIDATION
// ============================================

export const invalidateLabelCache = (boardId) => {
  const id = ensureString(boardId);
  if (id) {
    clearCacheByPattern(`cache:labels:*${id}*`).catch(() => {});
  }
};

export const invalidateCategoryCache = (departmentId) => {
  const id = ensureString(departmentId);
  if (id) {
    clearCacheByPattern(`cache:categories:*${id}*`).catch(() => {});
  }
};

// ============================================
// SEARCH CACHE INVALIDATION
// ============================================

export const invalidateSearchCache = () => {
  clearCacheByPattern('cache:search:*').catch(() => {});
};

