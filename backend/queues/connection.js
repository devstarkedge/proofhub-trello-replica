/**
 * Shared Redis connection for BullMQ queues and workers.
 * 
 * BullMQ requires `maxRetriesPerRequest: null` on the IORedis connection.
 * We export a factory function so each Queue/Worker gets its own connection
 * (BullMQ best practice — sharing a single connection can cause issues).
 */
import IORedis from 'ioredis';
import config from '../config/index.js';

let _sharedConnection = null;

/**
 * Create a new IORedis connection with BullMQ-compatible defaults.
 * @param {object} overrides - Extra IORedis options
 * @returns {IORedis}
 */
export function createRedisConnection(overrides = {}) {
  return new IORedis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
    ...overrides,
  });
}

/**
 * Get a shared IORedis connection (for Queue instances that only publish).
 * Workers should always get their own connection via createRedisConnection().
 */
export function getSharedConnection() {
  if (!_sharedConnection) {
    _sharedConnection = createRedisConnection();
    _sharedConnection.on('error', (err) => {
      console.error('[Redis] Shared connection error:', err.message);
    });
    _sharedConnection.on('connect', () => {
      console.log('[Redis] Shared connection established');
    });
  }
  return _sharedConnection;
}

/**
 * Close the shared connection (call during graceful shutdown).
 */
export async function closeSharedConnection() {
  if (_sharedConnection) {
    await _sharedConnection.quit();
    _sharedConnection = null;
  }
}
