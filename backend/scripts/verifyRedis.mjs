// Isolated production-path verification. Requires an installed Docker daemon
// and a locally available redis image. Never uses the application's REDIS_URL.
import assert from 'node:assert/strict';
import { execFileSync, fork } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 30000, windowsHide: true }).trim();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(fn, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (true) { try { return await fn(); } catch (error) { if (Date.now() >= deadline) throw error; await wait(100); } }
}
const event = (emitter, name) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { emitter.off(name, receive); reject(new Error(`Timed out: ${name}`)); }, 15000);
  const receive = value => { clearTimeout(timer); resolve(value); };
  emitter.once(name, receive);
});

async function socketPeer() {
  const { Server } = await import('socket.io');
  const { configureRealtimeCluster, closeRealtimeCluster } = await import('../realtime/cluster.js');
  const { closeSharedConnection } = await import('../queues/connection.js');
  const http = createServer(); const io = new Server(http);
  io.on('connection', socket => { socket.join(process.env.REDIS_AUDIT_ROOM); socket.emit('audit-ready'); });
  await configureRealtimeCluster(io);
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  process.send({ port: http.address().port });
  process.once('message', async () => {
    await closeRealtimeCluster(); await closeSharedConnection();
    io.close(); process.exit(0);
  });
}

async function audit() {
  const name = `flowtask-redis-audit-${randomUUID().slice(0, 8)}`;
  const marker = randomUUID();
  let owned = false, peer, io, socket, queue, worker, shutdownQueues, closeRealtimeCluster, closeSharedConnection;
  try {
    const portProbe = createServer();
    await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
    const port = portProbe.address().port;
    await new Promise(resolve => portProbe.close(resolve));
    docker('run', '--detach', '--name', name, '--label', `flowtask.audit=${marker}`, '--publish', `127.0.0.1:${port}:6379`,
      '--memory', '192m', 'redis:latest', 'redis-server', '--appendonly', 'yes', '--maxmemory', '96mb', '--maxmemory-policy', 'noeviction');
    owned = true;
    await eventually(() => assert.equal(docker('exec', name, 'redis-cli', 'PING'), 'PONG'));
    Object.assign(process.env, {
      NODE_ENV: 'production', REDIS_URL: `redis://127.0.0.1:${port}`,
      REDIS_CONNECT_TIMEOUT_MS: '5000', REDIS_COMMAND_TIMEOUT_MS: '1500', REDIS_SHUTDOWN_TIMEOUT_MS: '1000',
      MONGO_URI: 'mongodb://127.0.0.1:1/unused-audit-db', JWT_SECRET: 'isolated-redis-verification-secret',
      CLOUDINARY_CLOUD_NAME: 'isolated-audit', CLOUDINARY_API_KEY: 'test-only', CLOUDINARY_API_SECRET: 'test-only',
      FRONTEND_URL: 'http://localhost:5173', CHAT_ENABLED: 'false', SLACK_ENABLED: 'false', SOCKET_REDIS_ADAPTER: 'true',
      REDIS_AUDIT_ROOM: randomUUID(),
    });
    const connection = await import('../queues/connection.js');
    ({ closeSharedConnection } = connection);
    ({ shutdownQueues } = await import('../queues/queueManager.js'));
    const client = await connection.connectRedis();
    assert.equal(client, connection.getSharedConnection()); assert.equal(client, connection.getWorkerConnection());
    const starts = [
      ['email', 'Email'], ['notification', 'Notification'], ['activity', 'Activity'], ['announcement', 'Announcement'],
      ['cleanup', 'Cleanup'], ['recurringTask', 'RecurringTask'], ['salesAlert', 'SalesAlert'],
      ['chatWebhook', 'ChatWebhook'], ['slack', 'Slack'], ['leave', 'Leave'],
    ];
    const workers = [];
    for (const [file, prefix] of starts) {
      const module = await import(`../workers/${file}Worker.js`);
      const start = module[`start${prefix}Worker`];
      const instance = start(); assert.equal(start(), instance); workers.push(instance);
    }
    await Promise.all(workers.map(item => item.waitUntilReady()));
    const { Server } = await import('socket.io');
    const mainHttp = createServer();
    io = new Server(mainHttp);
    await new Promise(resolve => mainHttp.listen(0, '127.0.0.1', resolve));
    const cluster = await import('../realtime/cluster.js');
    ({ closeRealtimeCluster } = cluster);
    await cluster.configureRealtimeCluster(io); await cluster.configureRealtimeCluster(io);
    const clients = () => client.client('LIST').then(value => value.trim().split('\n').filter(Boolean));
    await eventually(async () => assert.equal((await clients()).length, 12));
    const expectedConnections = (await clients()).length;
    console.log('Verified: connection count and idempotent worker startup');

    peer = fork(fileURLToPath(import.meta.url), ['peer'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
    const peerAddress = await event(peer, 'message');
    const require = createRequire(new URL('../../desktopApp/package.json', import.meta.url));
    socket = require('socket.io-client').io(`http://127.0.0.1:${peerAddress.port}`, { autoConnect: false, transports: ['websocket'] });
    const ready = event(socket, 'audit-ready'); socket.connect(); await ready;
    const received = event(socket, 'audit-event');
    io.to(process.env.REDIS_AUDIT_ROOM).emit('audit-event', { verified: true });
    assert.deepEqual(await received, { verified: true });
    console.log('Verified: cross-process socket broadcast');
    socket.disconnect(); const peerExit = event(peer, 'exit'); peer.send('close'); await peerExit; peer = null;

    const { rateLimiter } = await import('../middleware/rateLimiter.js');
    const options = { windowMs: 1000, maxRequests: 1, keyFn: req => req.user.id };
    const limitA = rateLimiter(options), limitB = rateLimiter(options);
    const request = async (limiter, workspaceId) => {
      const result = { status: 200 };
      const req = { method: 'POST', baseUrl: '/audit', route: { path: '/action' }, workspaceId, user: { id: 'auditor' } };
      const res = { setHeader() {}, status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; } };
      await limiter(req, res, () => {}); return result;
    };
    assert.equal((await request(limitA, 'A')).status, 200);
    assert.equal((await request(limitB, 'A')).status, 429);
    assert.equal((await request(limitA, 'B')).status, 200);
    const keys = await client.keys('flowtask:ws:*:rate-limit:*');
    assert.equal(keys.length, 2); assert.ok((await client.pttl(keys[0])) > 0);
    await wait(1050); assert.equal((await request(limitA, 'A')).status, 200);
    console.log('Verified: shared tenant-scoped rate limits and TTL expiry');

    const { Queue, Worker } = await import('../queues/runtime.js');
    const { getActiveWorkspaceId } = await import('../modules/workspaces/workspaceContext.js');
    queue = new Queue('flowtask.audit');
    worker = new Worker('flowtask.audit', () => getActiveWorkspaceId());
    await worker.waitUntilReady();
    const completed = event(worker, 'completed');
    await queue.add('scoped-work', { workspaceId: 'A' }, { jobId: 'audit:custom-id', removeOnComplete: false });
    await completed;
    const job = await queue.getJob('audit:custom-id');
    assert.equal(job.id, 'audit:custom-id'); assert.equal(job.returnvalue, 'A');
    assert.equal((await clients()).length, 13);
    const { Queue: BullQueue } = await import('bullmq');
    const legacy = new BullQueue('flowtask.audit', { connection: client });
    try {
      const options = { repeat: { every: 60000 }, jobId: 'repeat:legacy-audit' };
      await legacy.add('repeat-audit', {}, options);
      await queue.add('repeat-audit', {}, options);
      assert.equal((await queue.getRepeatableJobs()).length, 1);
    } finally { await legacy.close(); }
    console.log('Verified: production job execution and workspace context');

    docker('pause', name);
    assert.equal((await request(limitA, 'outage')).status, 503);
    await assert.rejects(queue.add('outage', { workspaceId: 'A' }, { jobId: 'audit:outage' }), /Job service is unavailable/);
    docker('unpause', name);
    await eventually(() => client.ping().then(value => assert.equal(value, 'PONG')));
    docker('restart', '--time', '1', name);
    await eventually(() => client.ping().then(value => assert.equal(value, 'PONG')));
    await queue.add('after-reconnect', { workspaceId: 'B' }, { jobId: 'audit:reconnected' });
    await eventually(async () => assert.equal((await queue.getJob('audit:reconnected'))?.returnvalue, 'B'));
    console.log('Verified: explicit outage failures and reconnect');
    await worker.close(); await queue.close(); worker = null; queue = null;

    docker('pause', name);
    const shutdownAt = Date.now();
    await closeRealtimeCluster(); await shutdownQueues();
    assert.ok(Date.now() - shutdownAt < 10000);
    docker('unpause', name);
    await eventually(() => assert.equal(docker('exec', name, 'redis-cli', 'CLIENT', 'LIST').split('\n').filter(Boolean).length, 1));
    console.log('REDIS_AUDIT_RESULT ' + JSON.stringify({ expectedConnections, crossProcessSockets: true,
      sharedRateLimits: true, tenantIsolation: true, ttlExpiry: true, jobExecution: true,
      repeatScheduleDeduplication: true, explicitOutageFailures: true, reconnect: true, shutdownDuringOutage: true }));
  } catch (error) {
    console.error('Audit step failed:', error.stack);
    throw error;
  } finally {
    if (owned && docker('inspect', '--format', '{{.State.Paused}}', name) === 'true') docker('unpause', name);
    socket?.disconnect(); peer?.kill();
    await closeSharedConnection?.();
    await Promise.race([worker?.close(true).catch(() => {}), wait(2000)]); await queue?.close().catch(() => {});
    await closeRealtimeCluster?.(); await shutdownQueues?.(); await closeSharedConnection?.();
    if (io) await new Promise(resolve => io.close(resolve));
    if (owned && docker('inspect', '--format', '{{index .Config.Labels "flowtask.audit"}}', name) === marker) docker('rm', '--force', name);
  }
}

try { if (process.argv[2] === 'peer') await socketPeer(); else await audit(); }
catch (error) { console.error('Redis verification failed:', error.stack); process.exitCode = 1; }
