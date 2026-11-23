const id = value => String(value?._id || value || '');

// Project access is a restriction in addition to role grants. Admin/Manager/HR
// and other access modes retain their existing behavior.
export function assignedWorkOnly(principal) {
  const role = typeof principal?.role === 'object' ? principal.role?.key || principal.role?.slug : principal?.role;
  const mode = principal?.restriction?.type || principal?.accessType;
  return Boolean(principal && !principal.isOwner && principal.kind !== 'guest' &&
    !['admin', 'manager', 'hr', 'guest'].includes(role) && ['assigned_only', 'assigned_tasks'].includes(mode));
}

export function assignedWorkTask(ctx, task) {
  const actor = id(ctx?.userId || ctx?._id || ctx?.id);
  return Boolean(actor && ((task?.assignees || []).some(user => id(user) === actor) ||
    (ctx?.assignedTaskIds || []).some(value => id(value) === id(task?._id))));
}

// The backend supplies authorized root IDs, including roots needed to reach
// assigned subtask/nano work. Keep original list keys and card ordering intact.
export function filterAssignedWorkCards(cardsByList, access) {
  if (access?.mode !== 'assigned') return cardsByList;
  const ids = new Set((access.taskIds || []).map(id));
  return Object.fromEntries(Object.entries(cardsByList || {}).map(([list, cards]) => [list,
    Array.isArray(cards) ? cards.filter(card => ids.has(id(card._id)) || (card.assignees || []).some(user => id(user) === id(access.userId))) : cards]));
}
