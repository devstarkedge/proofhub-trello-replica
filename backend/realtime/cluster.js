import { createAdapter } from '@socket.io/redis-adapter';
import { createRedisConnection } from '../queues/connection.js';
import logger from '../utils/logger.js';

let clients = [];
export async function configureRealtimeCluster(io) {
  if (process.env.SOCKET_REDIS_ADAPTER !== 'true') return;
  const pub = createRedisConnection({ lazyConnect: true, enableOfflineQueue: false, retryStrategy: attempt => Math.min(attempt * 500, 5000) });
  const sub = pub.duplicate({ lazyConnect: true });
  clients = [pub, sub];
  for (const client of clients) {
    let reported = false;
    client.on('ready', () => {
      reported = false;
      if (clients.every(connection => connection.status === 'ready')) io.local.emit('realtime-recover', { schemaVersion: 1 });
    });
    client.on('error', error => { if (!reported) logger.warn('Realtime Redis transport unavailable', { code: error.code }); reported = true; });
  }
  // Configured multi-instance deployments must not silently start in local-only mode.
  try { await Promise.all(clients.map((client) => client.connect())); }
  catch (error) { clients.forEach(client => client.disconnect()); clients = []; throw error; }
  io.adapter(createAdapter(pub, sub, { key: 'flowtask-realtime' }));
  logger.info('Realtime Redis adapter enabled');
}
export async function closeRealtimeCluster() {
  await Promise.allSettled(clients.map((client) => client.quit()));
  clients = [];
}
