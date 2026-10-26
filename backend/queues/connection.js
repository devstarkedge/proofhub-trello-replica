import IORedis from 'ioredis';
import config from '../config/index.js';
import logger from '../utils/logger.js';

let shared = null;
let connecting = null;
let closing = false;
const clients = new Set();
const errors = new Map();

export function serviceUnavailable(service = 'Redis') {
  const error = new Error(`${service} service is unavailable; retry later`);
  error.code = 'SERVICE_UNAVAILABLE';
  error.statusCode = 503;
  return error;
}

// Driver messages/stacks may contain credentials. Log only fixed labels and safe codes.
export function reportRedisError(role, error) {
  if (!config.redis.enabled && !config.redis.cacheEnabled) return;
  const code = /^[A-Z0-9_]{1,40}$/.test(error?.code || '') ? error.code : 'REDIS_UNAVAILABLE';
  if (errors.has(role) && Date.now() - errors.get(role) < config.redis.errorLogIntervalMs) return;
  errors.set(role, Date.now());
  logger.error('Redis service unavailable', { role, code });
}

export async function withTimeout(operation, timeoutMs, service = 'Redis') {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => { timer = setTimeout(() => reject(serviceUnavailable(service)), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

class ManagedRedis extends IORedis {
  duplicate(overrides = {}) {
    // BullMQ needs a blocking socket per worker without a command timeout.
    return track(super.duplicate({ ...overrides, commandTimeout: undefined,
      enableOfflineQueue: true, maxRetriesPerRequest: null }), 'blocking-worker');
  }
}

function track(client, role) {
  clients.add(client);
  client.on('error', error => reportRedisError(role, error));
  client.once('end', () => clients.delete(client));
  return client;
}

function createClient(role, overrides = {}) {
  if (!config.redis.enabled && !config.redis.cacheEnabled) return null;
  if (closing) throw serviceUnavailable();
  return track(new ManagedRedis(config.redis.url, {
    lazyConnect: true, enableReadyCheck: true,
    // BullMQ requires null. Normal operations fail fast via readiness checks,
    // disabled offline queuing, and a command timeout instead.
    maxRetriesPerRequest: null, enableOfflineQueue: false,
    connectTimeout: config.redis.connectTimeoutMs,
    commandTimeout: config.redis.commandTimeoutMs,
    retryStrategy: attempt => closing ? null : Math.min(100 * 2 ** Math.min(attempt, 6), 5000) + Math.floor(Math.random() * 100),
    ...overrides,
  }), role);
}

export function getSharedConnection() {
  if (!config.redis.enabled && !config.redis.cacheEnabled) return null;
  if (!shared) shared = createClient('commands');
  return shared;
}

// Worker commands share the normal socket; BullMQ duplicates it for blocking reads.
export const getWorkerConnection = getSharedConnection;

export function getReadyConnection() {
  const client = getSharedConnection();
  if (!client || client.status !== 'ready') throw serviceUnavailable();
  return client;
}

export async function connectRedis({ cacheOnly = false } = {}) {
  if (!config.redis.enabled && !(cacheOnly && config.redis.cacheEnabled)) return null;
  if (connecting) return connecting;
  const client = getSharedConnection();
  if (client.status === 'ready') return client;
  connecting = (async () => {
    try {
      const ready = ['wait', 'end'].includes(client.status) ? client.connect() : new Promise((resolve, reject) => {
        const cleanup = () => { client.off('ready', onReady); client.off('end', onEnd); };
        const onReady = () => { cleanup(); resolve(); };
        const onEnd = () => { cleanup(); reject(serviceUnavailable()); };
        client.once('ready', onReady);
        client.once('end', onEnd);
      });
      await withTimeout(ready, config.redis.connectTimeoutMs);
      await client.ping();
      return client;
    } catch (error) {
      reportRedisError('startup', error);
      client.disconnect();
      throw serviceUnavailable('Production Redis');
    } finally { connecting = null; }
  })();
  return connecting;
}

export function createSubscriberConnection() {
  return config.redis.enabled ? createClient('socket-subscriber', { commandTimeout: undefined, enableOfflineQueue: true }) : null;
}

export async function closeRedisClient(client) {
  if (!client) return;
  try {
    if (client.status === 'ready') await withTimeout(client.quit(), config.redis.shutdownTimeoutMs);
  } catch { /* Force disconnect below, including during outages. */ }
  finally { client.disconnect(); clients.delete(client); }
}

export async function closeSharedConnection() {
  closing = true;
  try { await Promise.allSettled([...clients].map(closeRedisClient)); }
  finally { shared = null; connecting = null; closing = false; errors.clear(); }
}

export function workspaceKey(workspaceId, namespace, id) {
  if (!workspaceId) throw new Error('A workspace is required for a cache/rate-limit key');
  return `flowtask:ws:${encodeURIComponent(String(workspaceId))}:${namespace}:${encodeURIComponent(String(id))}`;
}

