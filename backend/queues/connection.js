/**
 * Shared Redis connection for BullMQ queues and workers.
 * 
 * BullMQ requires `maxRetriesPerRequest: null` on the IORedis connection.
 * Queues share one connection (publishing side).
 * Workers share another connection — BullMQ internally duplicates it
 * for blocking operations, keeping total connections low.
 */
import IORedis from 'ioredis';
import config from '../config/index.js';

let _sharedConnection = null;
let _workerConnection = null;

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
 * Workers should use getWorkerConnection() instead.
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
 * Get a shared IORedis connection for Workers.
 * BullMQ will internally call .duplicate() for each worker's blocking
 * client, but this keeps the base connection count to 1 instead of N.
 */
export function getWorkerConnection() {
  if (!_workerConnection) {
    _workerConnection = createRedisConnection();
    _workerConnection.on('error', (err) => {
      console.error('[Redis] Worker connection error:', err.message);
    });
  }
  return _workerConnection;
}

/**
 * Close the shared connection (call during graceful shutdown).
 */
export async function closeSharedConnection() {
  const closeTasks = [];
  if (_sharedConnection) {
    closeTasks.push(_sharedConnection.quit());
    _sharedConnection = null;
  }
  if (_workerConnection) {
    closeTasks.push(_workerConnection.quit());
    _workerConnection = null;
  }
  await Promise.allSettled(closeTasks);
}

