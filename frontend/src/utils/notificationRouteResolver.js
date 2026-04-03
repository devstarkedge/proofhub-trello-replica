/**
 * Central Notification Route Resolver
 * 
 * Inspects a notification object and returns the exact route, modal metadata,
 * and fallback info for navigation. This keeps notification routing scalable
 * and centralized — all notification types resolve through this function.
 */

// ── Notification type groupings ────────────────────────────────────

const TASK_TYPES = new Set([
  'task_assigned', 'task_updated', 'task_created', 'task_completed',
  'task_due_soon', 'task_overdue', 'task_moved', 'member_added',
  'deadline_approaching', 'status_change',
]);

const COMMENT_TYPES = new Set([
  'comment_added', 'comment_mention', 'comment_reply',
  'comment_reaction', 'comment_pinned',
  'role_mention', 'team_mention',
]);

const PROJECT_TYPES = new Set([
  'project_created', 'project_updates', 'project_deleted',
]);

const TEAM_TYPES = new Set([
  'team_invite', 'team_assigned', 'team_join',
]);

const REMINDER_TYPES = new Set([
  'reminder_due_soon', 'reminder_sent', 'reminder_completed',
  'reminder_missed', 'awaiting_client_response',
]);

const VERIFICATION_TYPES = new Set([
  'user_registered',
]);

const DEPARTMENT_TYPES = new Set([
  'user_assigned', 'user_unassigned',
]);

// ── ID extraction helpers ──────────────────────────────────────────

function extractId(notification, field) {
  // Try top-level field first
  const topLevel = notification?.[field];
  if (topLevel) return typeof topLevel === 'object' ? (topLevel._id || topLevel) : topLevel;

  // Fallback to metadata
  const fromMeta = notification?.metadata?.[field];
  if (fromMeta) return typeof fromMeta === 'object' ? (fromMeta._id || fromMeta) : fromMeta;

  return null;
}

function extractDepartmentId(notification) {
  return extractId(notification, 'departmentId');
}

function extractProjectId(notification) {
  return extractId(notification, 'projectId')
    || extractId(notification, 'relatedBoard');
}

function extractTaskId(notification) {
  return extractId(notification, 'taskId')
    || extractId(notification, 'relatedCard');
}

function extractAnnouncementId(notification) {
  return notification?.metadata?.announcementId
    || notification?.entityId
    || null;
}

// ── Main resolver ──────────────────────────────────────────────────

/**
 * @param {Object} notification - Full notification object from API/socket
 * @returns {{ 
 *   route: string,
 *   openModal: string|null,
 *   entityId: string|null,
 *   fallbackRoute: string,
 *   toastMessage: string|null,
 *   navigationState: Object|null,
 *   isSpecialFlow: boolean,
 *   specialFlowType: string|null
 * }}
 */
export function resolveNotificationRoute(notification) {
  if (!notification) {
    return fallback('/', 'Invalid notification');
  }

  const type = notification.type;
  const deptId = extractDepartmentId(notification);
  const projectId = extractProjectId(notification);
  const taskId = extractTaskId(notification);

  // ── Verification modal (special flow, no navigation) ──────────
  if (VERIFICATION_TYPES.has(type)) {
    return {
      route: null,
      openModal: null,
      entityId: notification.entityId || null,
      fallbackRoute: '/',
      toastMessage: null,
      navigationState: null,
      isSpecialFlow: true,
      specialFlowType: 'verification',
    };
  }

  // ── Task notifications → /workflow/{deptId}/{projectId}/{taskId} ─
  if (TASK_TYPES.has(type)) {
    // task_deleted → go to project level (task doesn't exist anymore)
    if (type === 'task_deleted') {
      if (deptId && projectId) {
        return result(
          `/workflow/${deptId}/${projectId}`,
          null,
          projectId,
          '/',
        );
      }
      return fallback('/', 'The deleted task could not be located');
    }

    if (deptId && projectId && taskId) {
      return result(
        `/workflow/${deptId}/${projectId}/${taskId}`,
        'task',
        taskId,
        deptId && projectId ? `/workflow/${deptId}/${projectId}` : '/',
      );
    }
    // Partial IDs — fall to project or home
    if (deptId && projectId) {
      return result(
        `/workflow/${deptId}/${projectId}`,
        null,
        projectId,
        '/',
        'Task details unavailable. Opening project instead.',
      );
    }
    return tryMetadataUrl(notification, 'Could not resolve task location');
  }

  // ── Comment notifications → task page with deepLink state ─────
  if (COMMENT_TYPES.has(type)) {
    const commentId = notification.deepLink?.commentId || null;
    const contextType = notification.deepLink?.contextType || null;
    const contextRef = notification.deepLink?.contextRef || null;

    if (deptId && projectId && taskId) {
      return {
        route: `/workflow/${deptId}/${projectId}/${taskId}`,
        openModal: 'task',
        entityId: taskId,
        fallbackRoute: `/workflow/${deptId}/${projectId}`,
        toastMessage: null,
        navigationState: {
          highlightEntity: taskId,
          commentId,
          commentContextType: contextType,
          commentContextRef: contextRef,
        },
        isSpecialFlow: false,
        specialFlowType: null,
      };
    }
    if (deptId && projectId) {
      return result(
        `/workflow/${deptId}/${projectId}`,
        null,
        projectId,
        '/',
        'Comment context unavailable. Opening project instead.',
      );
    }
    return tryMetadataUrl(notification, 'Could not locate the comment');
  }

  // ── Project notifications → /workflow/{deptId}/{projectId} ────
  if (PROJECT_TYPES.has(type)) {
    if (deptId && projectId) {
      return result(
        `/workflow/${deptId}/${projectId}`,
        null,
        projectId,
        '/',
      );
    }
    return tryMetadataUrl(notification, 'Could not resolve project location');
  }

  // ── Announcement → /announcements?open={id} ──────────────────
  if (type === 'announcement_created') {
    const announcementId = extractAnnouncementId(notification);
    if (announcementId) {
      return result(
        `/announcements?open=${announcementId}`,
        'announcement',
        announcementId,
        '/announcements',
      );
    }
    return result('/announcements', null, null, '/');
  }

  // ── Team notifications → /teams ───────────────────────────────
  if (TEAM_TYPES.has(type)) {
    return result(
      notification?.metadata?.url || '/teams',
      null,
      notification.entityId || null,
      '/',
    );
  }

  // ── Department assignment → home ──────────────────────────────
  if (DEPARTMENT_TYPES.has(type)) {
    return result(
      notification?.metadata?.url || '/',
      null,
      notification.entityId || null,
      '/',
    );
  }

  // ── Reminder types → /reminders ───────────────────────────────
  if (REMINDER_TYPES.has(type)) {
    return result(
      notification?.metadata?.url || '/reminders',
      null,
      notification.entityId || null,
      '/',
    );
  }

  // ── User verified/approved/declined → /teams or admin ─────────
  if (['user_verified', 'user_approved', 'user_declined'].includes(type)) {
    return result(
      notification?.metadata?.url || '/',
      null,
      null,
      '/',
    );
  }

  // ── Module access (e.g., sales) ───────────────────────────────
  if (type === 'module_access') {
    return result(
      notification?.metadata?.url || '/sales',
      null,
      null,
      '/',
    );
  }

  // ── System alerts → home ──────────────────────────────────────
  if (type === 'system_alert') {
    return result(
      notification?.metadata?.url || '/',
      null,
      null,
      '/',
    );
  }

  // ── Catch-all: use metadata.url or fall to home ───────────────
  return tryMetadataUrl(notification, null);
}

// ── Builder helpers ────────────────────────────────────────────────

function result(route, openModal = null, entityId = null, fallbackRoute = '/', toastMessage = null) {
  return {
    route,
    openModal,
    entityId,
    fallbackRoute,
    toastMessage,
    navigationState: entityId ? { highlightEntity: entityId } : null,
    isSpecialFlow: false,
    specialFlowType: null,
  };
}

function fallback(route = '/', toastMessage = null) {
  return {
    route,
    openModal: null,
    entityId: null,
    fallbackRoute: '/',
    toastMessage,
    navigationState: null,
    isSpecialFlow: false,
    specialFlowType: null,
  };
}

function tryMetadataUrl(notification, defaultToast = null) {
  const url = notification?.metadata?.url;
  if (url) {
    return result(url, null, null, '/');
  }
  return fallback('/', defaultToast);
}

/**
 * Get a human-readable route hint for display in notification cards.
 * Returns a short string like "Marketing → Homepage Redesign" or "Announcements".
 */
export function getNotificationRouteHint(notification) {
  if (!notification) return null;
  const type = notification.type;

  if (TASK_TYPES.has(type) || COMMENT_TYPES.has(type)) {
    const parts = [];
    if (notification.metadata?.projectName) {
      parts.push(notification.metadata.projectName);
    }
    if (notification.metadata?.cardTitle) {
      parts.push(notification.metadata.cardTitle);
    }
    return parts.length > 0 ? parts.join(' → ') : null;
  }

  if (type === 'announcement_created') return 'Announcements';
  if (TEAM_TYPES.has(type)) return 'Teams';
  if (REMINDER_TYPES.has(type)) return 'Reminders';
  if (DEPARTMENT_TYPES.has(type)) {
    return notification.metadata?.departmentName
      ? `Department: ${notification.metadata.departmentName}`
      : null;
  }
  if (type === 'module_access') return 'Sales';

  return null;
}
