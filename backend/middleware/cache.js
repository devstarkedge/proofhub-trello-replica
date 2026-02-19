import { getCache, setCache, clearCacheByPattern } from '../utils/redisCache.js';
import { isRedisReady } from '../config/redis.js';

// ============================================
// REDIS-BASED CACHE MIDDLEWARE
// ============================================

/**
 * User-scoped cache middleware for authenticated routes.
 * Cache key: cache:{prefix}:user:{userId}:{originalUrl}
 *
 * @param {string} prefix - Cache key prefix (e.g., 'boards', 'cards', 'analytics')
 * @param {number} ttl - Time to live in seconds (default: 120)
 */
export const cacheMiddleware = (prefix, ttl = 120) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next();
    // Skip if Redis is not available — fall through to controller
    if (!isRedisReady()) return next();

    try {
      const userId = req.user?._id || req.user?.id || 'anon';
      const cacheKey = `cache:${prefix}:user:${userId}:${req.originalUrl}`;

      // Check cache
      const cached = await getCache(cacheKey);
      if (cached !== null) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[Cache HIT] ${cacheKey}`);
        }
        return res.json(cached);
      }

      // Cache miss — intercept response
      const originalJson = res.json.bind(res);
      res.json = function (data) {
        // Store in cache asynchronously (don't block response)
        setCache(cacheKey, data, ttl).catch(() => {});
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[Cache SET] ${cacheKey} (TTL: ${ttl}s)`);
        }
        return originalJson(data);
      };

      next();
    } catch (err) {
      // On any error, just skip caching and proceed normally
      if (process.env.NODE_ENV !== 'production') {
        console.error('[Cache Middleware] Error:', err.message);
      }
      next();
    }
  };
};

/**
 * Public (shared) cache middleware — NOT user-scoped.
 * Use for endpoints that return the same data for all users.
 * Cache key: cache:{prefix}:public:{originalUrl}
 *
 * @param {string} prefix - Cache key prefix
 * @param {number} ttl - Time to live in seconds (default: 300)
 */
export const publicCacheMiddleware = (prefix, ttl = 300) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();
    if (!isRedisReady()) return next();

    try {
      const cacheKey = `cache:${prefix}:public:${req.originalUrl}`;

      const cached = await getCache(cacheKey);
      if (cached !== null) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[Cache HIT] ${cacheKey}`);
        }
        return res.json(cached);
      }

      const originalJson = res.json.bind(res);
      res.json = function (data) {
        setCache(cacheKey, data, ttl).catch(() => {});
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[Cache SET] ${cacheKey} (TTL: ${ttl}s)`);
        }
        return originalJson(data);
      };

      next();
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[Cache Middleware] Error:', err.message);
      }
      next();
    }
  };
};

// ============================================
// CACHE INVALIDATION (drop-in replacement)
// ============================================

/**
 * Invalidate cache keys matching a pattern string.
 * Drop-in replacement for the old node-cache invalidateCache.
 *
 * Existing controllers call: invalidateCache('/api/boards/123')
 * This translates to clearing Redis keys: cache:*<pattern>*
 *
 * @param {string} pattern - URL pattern or substring to match
 */
export const invalidateCache = (pattern) => {
  if (!pattern) return;

  // Fire-and-forget — do NOT await in controllers
  clearCacheByPattern(`cache:*${pattern}*`).catch((err) => {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[Cache Invalidate] Error for pattern "${pattern}":`, err.message);
    }
  });
};

export default { cacheMiddleware, publicCacheMiddleware, invalidateCache };
