export const notificationId = (value) => String(value?._id || value?.id || value || '');
export function notificationMatches(notification, filter) {
  if (notification.isArchived) return false;
  if (filter === 'unread') return !notification.isRead;
  if (filter === 'mentions') return notification.type === 'comment_mention';
  if (filter === 'tasks') return notification.type?.startsWith('task_');
  return true;
}
export function mergeNotifications(current, incoming, limit = 500) {
  const map = new Map(current.map((item) => [notificationId(item), item]));
  for (const item of incoming) if (item?._id) map.set(notificationId(item), item);
  return [...map.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || notificationId(b).localeCompare(notificationId(a))).slice(0, limit);
}
export function notificationBelongsTo(notification, userId, workspaceId) {
  return Boolean(userId && workspaceId && notificationId(notification.user || notification.recipientId) === String(userId) &&
    notificationId(notification.workspaceId) === String(workspaceId));
}
