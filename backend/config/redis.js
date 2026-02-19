import { createClient } from 'redis';

// ============================================
// REDIS CLIENT CONFIGURATION
// ============================================

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Create Redis client with retry strategy
const redisClient = createClient({
  url: REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 20) {
        console.error('[Redis] Max reconnection attempts reached. Giving up.');
        return new Error('Max reconnection attempts reached');
      }
      const delay = Math.min(retries * 500, 10000); // Exponential backoff, max 10s
      console.log(`[Redis] Reconnecting in ${delay}ms... (attempt ${retries})`);
      return delay;
    },
    connectTimeout: 10000, // 10s connection timeout
  }
});

// ============================================
// EVENT HANDLERS
// ============================================

redisClient.on('connect', () => {
  console.log('[Redis] Connecting...');
});

redisClient.on('ready', () => {
  console.log('[Redis] Connected and ready');
});

redisClient.on('error', (err) => {
  // Log but do NOT crash the server
  console.error('[Redis] Error:', err.message);
});

redisClient.on('reconnecting', () => {
  console.log('[Redis] Reconnecting...');
});

redisClient.on('end', () => {
  console.log('[Redis] Connection closed');
});

// ============================================
// CONNECTION MANAGEMENT
// ============================================

/**
 * Connect to Redis server.
 * Non-blocking — if Redis is unavailable, the app continues without cache.
 */
export const connectRedis = async () => {
  try {
    await redisClient.connect();
    console.log('[Redis] Successfully connected to', REDIS_URL.replace(/\/\/.*@/, '//<credentials>@'));
  } catch (err) {
    console.error('[Redis] Initial connection failed (non-fatal):', err.message);
    console.log('[Redis] App will continue without cache. Redis will auto-reconnect when available.');
  }
};

/**
 * Gracefully disconnect Redis.
 */
export const disconnectRedis = async () => {
  try {
    if (redisClient.isOpen) {
      await redisClient.quit();
      console.log('[Redis] Disconnected gracefully');
    }
  } catch (err) {
    console.error('[Redis] Error during disconnect:', err.message);
    // Force close if quit fails
    try {
      await redisClient.disconnect();
    } catch (e) {
      // Ignore
    }
  }
};

/**
 * Check if Redis is connected and ready for operations.
 */
export const isRedisReady = () => {
  return redisClient.isReady;
};

export default redisClient;
