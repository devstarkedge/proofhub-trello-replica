// No Redis option (including a populated REDIS_URL) can enable it outside production.
export function redisConfig(env) {
  const enabled = env.NODE_ENV === 'production';
  const integer = (key, fallback) => {
    if (!enabled || !env[key]) return fallback;
    const value = Number(env[key]);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer`);
    return value;
  };
  const url = enabled ? env.REDIS_URL?.trim() : null;
  if (enabled) {
    if (!url) throw new Error('Production requires REDIS_URL for jobs, distributed rate limits and realtime delivery');
    try {
      const parsed = new URL(url);
      if (!['redis:', 'rediss:'].includes(parsed.protocol) || !parsed.hostname || parsed.hash) throw new Error();
    } catch {
      throw new Error('REDIS_URL must be a valid redis:// or rediss:// connection URL');
    }
  }
  return {
    enabled, url,
    socketAdapterEnabled: enabled && env.SOCKET_REDIS_ADAPTER !== 'false',
    connectTimeoutMs: integer('REDIS_CONNECT_TIMEOUT_MS', 5000),
    commandTimeoutMs: integer('REDIS_COMMAND_TIMEOUT_MS', 5000),
    shutdownTimeoutMs: integer('REDIS_SHUTDOWN_TIMEOUT_MS', 5000),
    errorLogIntervalMs: integer('REDIS_ERROR_LOG_INTERVAL_MS', 60000),
  };
}
