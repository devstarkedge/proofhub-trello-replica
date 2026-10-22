import { createAdapter } from '@socket.io/redis-adapter';
import config from '../config/index.js';
import { connectRedis, createSubscriberConnection, closeRedisClient, withTimeout, serviceUnavailable, reportRedisError } from '../queues/connection.js';

let configured = null;
let subscriber = null;
let publisher = null;
let starting = null;
let notifyReady = null;

// The adapter fires publish/subscribe/unsubscribe commands without awaiting
// their promises. Observe rejections, including pending unsubscribe commands
// rejected by forced shutdown, without replacing the underlying shared client.
export function adapterClient(client, role) {
  const commands = new Set(['publish', 'subscribe', 'psubscribe', 'unsubscribe', 'punsubscribe']);
  return new Proxy(client, { get(target, key) {
    const value = Reflect.get(target, key);
    if (typeof value !== 'function') return value;
    if (!commands.has(key)) return value.bind(target);
    return (...args) => {
      const operation = value.apply(target, args);
      operation?.catch(error => reportRedisError(role, error));
      return operation;
    };
  } });
}

export async function configureRealtimeCluster(io) {
  if (!config.redis.socketAdapterEnabled) return; // Socket.IO's built-in single-process adapter.
  if (configured === io) return;
  if (starting) return starting;
  starting = (async () => {
    try {
      publisher = await connectRedis();
      subscriber = createSubscriberConnection();
      await withTimeout(subscriber.connect(), config.redis.connectTimeoutMs);
      io.adapter(createAdapter(adapterClient(publisher, 'socket-publisher'), adapterClient(subscriber, 'socket-subscriber'), { key: 'flowtask-realtime' }));
      configured = io;
      notifyReady = () => {
        if (publisher?.status === 'ready' && subscriber?.status === 'ready') io.local.emit('realtime-recover', { schemaVersion: 1 });
      };
      publisher.on('ready', notifyReady);
      subscriber.on('ready', notifyReady);
    } catch {
      await closeRealtimeCluster();
      throw serviceUnavailable('Realtime transport');
    } finally { starting = null; }
  })();
  return starting;
}

export async function closeRealtimeCluster() {
  if (notifyReady) {
    publisher?.off('ready', notifyReady);
    subscriber?.off('ready', notifyReady);
  }
  try {
    if (configured) await withTimeout(Promise.resolve(configured.of('/').adapter.close()), config.redis.shutdownTimeoutMs);
  } catch { /* The subscriber is force-disconnected below if the server is down. */ }
  await closeRedisClient(subscriber);
  configured = null; subscriber = null; publisher = null; notifyReady = null;
}
