// Workspace-level directory failures happen before individual outbox retries.
// Persist their cooldown too, so restarts/multiple instances cannot hot-loop.
export function isWorkspaceMappingUnavailable(error) {
  return ['WORKSPACE_NOT_LINKED', 'WORKSPACE_MAPPING_INACTIVE'].includes(error.response?.data?.error?.code);
}

export function reportingRetry(error, state, now = Date.now()) {
  const status = error.response?.status || null;
  const code = String(error.response?.data?.error?.code || error.code || (status ? `HTTP_${status}` : 'DELIVERY_FAILED')).slice(0, 100);
  const failureCount = Math.min((state.failureCount || 0) + 1, 20);
  const delay = isWorkspaceMappingUnavailable(error)
    ? 15 * 60000 : Math.min(300000, 30000 * 2 ** Math.min(failureCount - 1, 4));
  return { failureCount, nextAttemptAt: new Date(now + delay), lastFailureCode: code, lastFailureStatus: status };
}
