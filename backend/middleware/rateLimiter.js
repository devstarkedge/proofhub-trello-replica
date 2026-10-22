import { createHash } from 'node:crypto';
import config from '../config/index.js';
import { getReadyConnection, reportRedisError, workspaceKey } from '../queues/connection.js';

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
  } = options;
  const policy = hash([windowMs, maxRequests, message, String(keyFn)].join('|'));
  // One local store per factory, never a production fallback.
  const store = config.redis.enabled ? null : new Map();
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
        [count, remaining] = await getReadyConnection().eval(INCREMENT_WINDOW, 1, key, windowMs);
      } catch (error) {
        reportRedisError('rate-limit', error);
        res.setHeader('Retry-After', '5');
        return res.status(503).json({ success: false, message: 'Request limiting is temporarily unavailable; retry later' });
      }
    } else {
      const key = JSON.stringify([workspace, identity]);
      let entry = store.get(key);
      if (!entry || Date.now() >= entry.resetTime) {
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
