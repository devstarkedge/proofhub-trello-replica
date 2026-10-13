export const LEAVE_SCOPE_REFRESH_EVENTS = [
  'socket-authz-changed', 'socket-user-access-updated', 'socket-access-control-updated', 'socket-user-role-changed',
  'socket-user-assigned', 'socket-user-unassigned', 'socket-department-bulk-assigned', 'socket-department-bulk-unassigned'
];
export const LEAVE_REFRESH_EVENTS = [
  'socket-leave-request-created', 'socket-leave-request-updated', 'socket-leave-approval-updated',
  'socket-leave-calendar-updated', 'socket-leave-balance-updated', 'socket-leave-policy-updated',
  'socket-connected', 'socket-disconnected', ...LEAVE_SCOPE_REFRESH_EVENTS, 'leave-local-change'
];

// Events are invalidations, never authoritative records. Coalesce bursts and
// refetch on reconnection/focus; delayed or repeated events cannot overwrite data.
export function subscribeLeaveRefresh({ target = window, workspaceId, refresh, onInvalidate, schedule = setTimeout, cancel = clearTimeout }) {
  let timer;
  const invalidate = (event) => {
    if (event?.detail?.workspaceId && String(event.detail.workspaceId) !== String(workspaceId)) return;
    onInvalidate?.(event);
    cancel(timer);
    timer = schedule(refresh, 120);
  };
  for (const event of [...LEAVE_REFRESH_EVENTS, 'focus']) target.addEventListener(event, invalidate);
  return () => {
    cancel(timer);
    for (const event of [...LEAVE_REFRESH_EVENTS, 'focus']) target.removeEventListener(event, invalidate);
  };
}

export function createLatestLeaveRead() {
  let generation = 0;
  return { begin: () => ++generation, isCurrent: (id) => id === generation, invalidate: () => { generation++; } };
}
