import redisClient, { isRedisReady } from '../config/redis.js';

// ============================================
// CORE REDIS CACHE OPERATIONS
// ============================================

/**
 * Get a cached value from Redis.
 * Returns parsed JSON or null if not found / Redis is down.
 * @param {string} key - Cache key
 * @returns {Promise<any|null>}
 */
export const getCache = async (key) => {
  try {
    if (!isRedisReady()) return null;
    const data = await redisClient.get(key);
    if (!data) return null;
    return JSON.parse(data);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[RedisCache] GET error for key "${key}":`, err.message);
    }
    return null;
  }
};

/**
 * Set a value in Redis cache with TTL.
 * Silently fails if Redis is down.
 * @param {string} key - Cache key
 * @param {any} data - Data to cache (will be JSON.stringified)
 * @param {number} ttl - Time to live in seconds (default: 120)
 * @returns {Promise<boolean>}
 */
export const setCache = async (key, data, ttl = 120) => {
  try {
    if (!isRedisReady()) return false;
    const serialized = JSON.stringify(data);
    // Skip caching for extremely large payloads (>5MB)
    if (serialized.length > 5 * 1024 * 1024) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[RedisCache] Skipping cache for key "${key}" — payload too large (${(serialized.length / 1024 / 1024).toFixed(1)}MB)`);
      }
      return false;
    }
    await redisClient.setEx(key, ttl, serialized);
    return true;
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[RedisCache] SET error for key "${key}":`, err.message);
    }
    return false;
  }
};

/**
 * Delete a specific cache key.
 * @param {string} key - Cache key to delete
 * @returns {Promise<boolean>}
 */
export const deleteCache = async (key) => {
  try {
    if (!isRedisReady()) return false;
    await redisClient.del(key);
    return true;
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[RedisCache] DEL error for key "${key}":`, err.message);
    }
    return false;
  }
};

/**
 * Clear all cache keys matching a pattern using SCAN (non-blocking).
 * Uses SCAN instead of KEYS to avoid blocking Redis in production.
 * @param {string} pattern - Redis glob pattern (e.g., "cache:boards:*")
 * @returns {Promise<number>} - Number of keys deleted
 */
export const clearCacheByPattern = async (pattern) => {
  try {
    if (!isRedisReady()) return 0;

    // Sanity check: reject invalid or absurdly long patterns (likely a bug upstream)
    if (typeof pattern !== 'string' || pattern.length > 300) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[RedisCache] Skipping invalid pattern (type=${typeof pattern}, len=${pattern?.length})`);
      }
      return 0;
    }

    const keysToDelete = [];

    // Use scanIterator to avoid cursor type issues across redis client versions
    for await (const key of redisClient.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      keysToDelete.push(key);
    }

    if (keysToDelete.length > 0) {
      // Delete in batches of 100 to avoid overly large DEL commands
      for (let i = 0; i < keysToDelete.length; i += 100) {
        const batch = keysToDelete.slice(i, i + 100);
        await redisClient.del(batch);
      }
    }

    if (keysToDelete.length > 0 && process.env.NODE_ENV !== 'production') {
      console.log(`[RedisCache] Cleared ${keysToDelete.length} keys matching "${pattern}"`);
    }
    return keysToDelete.length;
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[RedisCache] SCAN/DEL error for pattern "${pattern.slice(0, 80)}":`, err.message);
    }
    return 0;
  }
};

/**
 * Clear multiple cache patterns in parallel.
 * @param {string[]} patterns - Array of Redis glob patterns
 * @returns {Promise<number>} - Total number of keys deleted
 */
export const clearMultipleCachePatterns = async (patterns) => {
  try {
    if (!isRedisReady() || !patterns || patterns.length === 0) return 0;
    const results = await Promise.allSettled(
      patterns.map(pattern => clearCacheByPattern(pattern))
    );
    return results.reduce((total, r) => total + (r.status === 'fulfilled' ? r.value : 0), 0);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[RedisCache] clearMultipleCachePatterns error:', err.message);
    }
    return 0;
  }
};

/**
 * Flush ALL cache keys (use with caution).
 * Only flushes keys with the "cache:" prefix to avoid clearing session data.
 * @returns {Promise<number>}
 */
export const flushAllCache = async () => {
  return clearCacheByPattern('cache:*');
};

/**
 * Get cache statistics (for monitoring/debugging).
 * @returns {Promise<object|null>}
 */
export const getCacheStats = async () => {
  try {
    if (!isRedisReady()) return null;
    const info = await redisClient.info('memory');
    const dbSize = await redisClient.dbSize();
    return {
      connected: true,
      totalKeys: dbSize,
      memoryInfo: info
    };
  } catch (err) {
    return { connected: false, error: err.message };
  }
};
