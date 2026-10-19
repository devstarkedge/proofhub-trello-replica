const QUEUEABLE_METHODS = new Set(['post', 'put', 'patch', 'delete']);

export function shouldQueueOfflineRequest(config) {
  const method = config?.method?.toLowerCase();
  return Boolean(
    config &&
    !config.skipOfflineQueue &&
    QUEUEABLE_METHODS.has(method) &&
    !config.url?.includes('/api/auth/')
  );
}
