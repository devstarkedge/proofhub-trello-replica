import { createHash } from 'node:crypto';
import config from '../config/index.js';
import { getReadyConnection, reportRedisError, workspaceKey, withTimeout } from '../queues/connection.js';

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
  } = options;
  const policy = hash([windowMs, maxRequests, message, String(keyFn)].join('|'));
  // Only explicitly opted-in authenticated reads can use a bounded local
  // limiter during a Redis outage. Auth/public routes and writes fail closed.
  const store = !config.redis.enabled || allowReadFallback ? new Map() : null;
  if (store) {
    setInterval(() => {
      for (const [key, entry] of store) if (Date.now() >= entry.resetTime) store.delete(key);
    }, 60000).unref();
  }
  return async (req, res, next) => {
    const identity = keyFn(req) ?? req.ip ?? 'unknown';
    const workspace = workspaceFn(req);
    let count, remaining;
    if (config.redis.enabled) {
      const route = [req.baseUrl || '', req.route ? `${req.method}:${req.route.path}` : 'router'].join(':');
      const key = workspaceKey(workspace, 'rate-limit', hash([policy, route, identity].join('|')));
      try {
        const operation = getReadyConnection().eval(INCREMENT_WINDOW, 1, key, windowMs);
        [count, remaining] = await (allowReadFallback ? withTimeout(operation, 250, 'Tracking read limiter') : operation);
      } catch (error) {
        reportRedisError('rate-limit', error);
        if (!allowReadFallback || !['GET', 'HEAD'].includes(req.method) || !req.user || !req.workspaceId) {
          res.setHeader('Retry-After', '5');
          return res.status(503).json({ success: false, message: 'Request limiting is temporarily unavailable; retry later' });
        }
      }
    }
    if (count === undefined) {
      const key = JSON.stringify([workspace, identity]);
      let entry = store.get(key);
      if (!entry || Date.now() >= entry.resetTime) {
        if (allowReadFallback && store.size >= 10000 && !store.has(key)) {
          res.setHeader('Retry-After', '5');
          return res.status(503).json({ success: false, message: 'Request limiting is temporarily unavailable; retry later' });
        }
        entry = { count: 0, resetTime: Date.now() + windowMs };
        store.set(key, entry);
      }
      count = ++entry.count;
      remaining = entry.resetTime - Date.now();
    }
    if (count > maxRequests) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(remaining / 1000))));
      return res.status(429).json({ success: false, message });
    }
    return next();
  };
};
