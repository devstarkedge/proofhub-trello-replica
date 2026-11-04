const id = value => String(value?._id || value || '');

export function announcementVisibility(user, now = new Date()) {
  const userId = user.id || user._id;
  const departments = (Array.isArray(user.department) ? user.department : [user.department]).filter(Boolean).map(value => value._id || value);
  return { $and: [
    { $or: [
      { createdBy: userId }, { 'subscribers.type': 'all' },
      { 'subscribers.users': userId }, ...(user.role ? [{ 'subscribers.roles': user.role }] : []),
      ...(departments.length ? [{ 'subscribers.type': 'departments', 'subscribers.departments': { $in: departments } }] : []),
      ...(user.role === 'manager' ? [{ 'subscribers.type': 'managers' }] : [])
    ] },
    { $or: [{ createdBy: userId }, { isScheduled: { $ne: true } }, { scheduledFor: { $lte: now } }] }
  ] };
}

export function announcementViewerKey(user) {
  return JSON.stringify([id(user.id || user._id), user.role, id(user.roleId),
    (Array.isArray(user.department) ? user.department : [user.department]).filter(Boolean).map(id).sort()]);
}

export function announcementListRequest(query) {
  const page = Number(query.page ?? 1), limit = Number(query.limit ?? 30);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw Object.assign(new Error('Invalid announcement pagination'), { statusCode: 400 });
  }
  return { page, limit, search: String(query.search || '').trim().slice(0, 200),
    category: query.category || 'all', sort: query.sort || 'latest', archived: query.isArchived === 'true' };
}

export const literalSearch = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
