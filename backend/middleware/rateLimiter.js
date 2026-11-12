import { createHash } from 'node:crypto';
import config from '../config/index.js';
import { getReadyConnection, reportRedisError, workspaceKey, withTimeout } from '../queues/connection.js';
import { requestRouteLabel } from './requestMetrics.js';

const hash = value => createHash('sha256').update(String(value)).digest('hex');
const INCREMENT_WINDOW = `
local count = redis.call('INCR', KEYS[1])
if count == 1 or redis.call('PTTL', KEYS[1]) < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return { count, redis.call('PTTL', KEYS[1]) }
`;

export const rateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000,
    maxRequests = 100,
    message = 'Too many requests, please try again later',
    keyFn = req => req.ip || req.connection?.remoteAddress,
    workspaceFn = req => req.workspaceId || 'public',
    allowReadFallback = false,
    allowWriteFallback = () => false,
  } = options;
  const policy = hash([windowMs, maxRequests, message, String(keyFn)].join('|'));
  // Explicitly opted-in authenticated reads/telemetry may use a bounded local
  // limiter during an outage. All other writes and public routes fail closed.
  const store = !config.redis.enabled || allowReadFallback ? new Map() : null;
  if (store) {
    setInterval(() => {
      for (const [key, entry] of store) if (Date.now() >= entry.resetTime) store.delete(key);
    }, 60000).unref();
  }
  return async (req, res, next) => {
    const identity = keyFn(req) ?? req.ip ?? 'unknown';
    const workspace = workspaceFn(req);
    const route = [req.baseUrl || '', req.route ? `${req.method}:${req.route.path}` : 'router'].join(':');
    let count, remaining, redisFailure;
    if (config.redis.enabled) {
      const key = workspaceKey(workspace, 'rate-limit', hash([policy, route, identity].join('|')));
      const timeoutMs = allowReadFallback ? config.redis.rateLimitTimeoutMs : config.redis.commandTimeoutMs;
      const startedAt = performance.now();
      try {
        const operation = getReadyConnection().eval(INCREMENT_WINDOW, 1, key, windowMs);
        [count, remaining] = await (allowReadFallback ? withTimeout(operation, timeoutMs, 'Redis rate limiter') : operation);
        req.recordRedisRateLimit?.(performance.now() - startedAt, true);
      } catch (error) {
        const elapsedMs = Math.round(performance.now() - startedAt);
        req.recordRedisRateLimit?.(elapsedMs, false);
        redisFailure = { error, details: { method: req.method, route: requestRouteLabel(req), timeoutMs, elapsedMs } };
        const fallback = allowReadFallback && req.user && req.workspaceId && (['GET', 'HEAD'].includes(req.method) || allowWriteFallback(req));
        if (!fallback) {
          reportRedisError('rate-limit', error, { ...redisFailure.details, outcome: 'rejected-503' });
          res.setHeader('Retry-After', '5');
          return res.status(503).json({ success: false, message: 'Request limiting is temporarily unavailable; retry later' });
        }
      }
    }
    if (count === undefined) {
      const key = JSON.stringify([workspace, route, identity]);
      let entry = store.get(key);
      if (!entry || Date.now() >= entry.resetTime) {
        if (allowReadFallback && store.size >= 10000 && !store.has(key)) {
          if (redisFailure) reportRedisError('rate-limit', redisFailure.error, { ...redisFailure.details, outcome: 'rejected-503' });
          res.setHeader('Retry-After', '5');
          return res.status(503).json({ success: false, message: 'Request limiting is temporarily unavailable; retry later' });
        }
        entry = { count: 0, resetTime: Date.now() + windowMs };
        store.set(key, entry);
      }
      count = ++entry.count;
      remaining = entry.resetTime - Date.now();
      if (redisFailure) reportRedisError('rate-limit', redisFailure.error, {
        ...redisFailure.details, outcome: count > maxRequests ? 'local-429' : 'local-fallback'
      });
    }
    if (count > maxRequests) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(remaining / 1000))));
      return res.status(429).json({ success: false, message });
    }
    return next();
  };
};
