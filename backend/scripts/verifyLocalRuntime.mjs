// Starts the real backend against a disposable MongoDB replica set. No external
// MongoDB, Redis, email, Slack or ChatApp service is used. Requires a cached
// mongodb-memory-server binary (or MONGOMS_SYSTEM_BINARY).
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(fn, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (true) { try { return await fn(); } catch (error) { if (Date.now() >= deadline) throw error; await wait(150); } }
}
if (process.argv[2] === 'server') {
  process.on('message', async message => {
    if (message === 'shutdown') process.emit('SIGTERM');
    if (message?.activity) {
      try {
        const { enqueueActivity } = await import('../queues/index.js');
        await enqueueActivity(message.activity, { delay: 300, jobId: 'audit:local-delayed-activity' });
        process.send({ enqueued: true });
      } catch { process.send({ enqueued: false }); }
    }
  });
  await import('../server.js');
} else {
  let db, child, mongoose, socket;
  let output = '';
  try {
    process.env.MONGOMS_RUNTIME_DOWNLOAD ||= 'false';
    const { MongoMemoryReplSet } = await import('mongodb-memory-server');
    db = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    const portProbe = createServer();
    await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
    const port = portProbe.address().port;
    await new Promise(resolve => portProbe.close(resolve));
    const secret = randomUUID();
    const env = { ...process.env, NODE_ENV: 'development', MONGO_URI: db.getUri(), JWT_SECRET: secret,
      PORT: String(port), REDIS_URL: 'redis://should-never-connect.invalid:6379', SOCKET_REDIS_ADAPTER: 'true',
      CLOUDINARY_CLOUD_NAME: 'isolated-audit', CLOUDINARY_API_KEY: 'test-only', CLOUDINARY_API_SECRET: 'test-only',
      ADMIN_EMAIL: 'bootstrap@audit.invalid', ADMIN_PASSWORD: '', SUPER_ADMIN_EMAILS: '', SUPER_ADMIN_PASSWORD: '',
      EMAIL_USER: '', EMAIL_PASS: '', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1',
      VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', CHAT_ENABLED: 'false', SLACK_ENABLED: 'false',
      CHAT_API_URL: '', CHAT_WEBHOOK_URL: '', CHATAPP_URL: 'http://localhost:5174', FRONTEND_URL: 'http://localhost:5173' };
    child = fork(fileURLToPath(import.meta.url), ['server'], { env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk.toString(); });
    const base = `http://127.0.0.1:${port}`;
    await eventually(async () => {
      assert.equal(child.exitCode, null, output);
      assert.equal((await fetch(`${base}/api/health`)).status, 200);
    });
    assert.match(output, /Job service initialized/);
    assert.match(output, /workers.*10/);
    mongoose = (await import('mongoose')).default;
    await mongoose.connect(db.getUri());
    const bcrypt = (await import('bcryptjs')).default;
    const userId = new mongoose.Types.ObjectId(), workspaceId = new mongoose.Types.ObjectId();
    const email = 'member@audit.invalid', password = 'Audit-only-Password42!';
    await mongoose.connection.collection('users').insertOne({ _id: userId, name: 'Local audit', email,
      password: await bcrypt.hash(password, 10), isActive: true, role: 'employee', department: [],
      lastActiveWorkspace: workspaceId, accessType: 'full_department', allowedProjects: [] });
    await mongoose.connection.collection('workspaces').insertOne({ _id: workspaceId, name: 'Audit', slug: 'audit',
      owner: userId, isActive: true, status: 'active', timezone: 'Asia/Kolkata' });
    await mongoose.connection.collection('workspacememberships').insertOne({ workspace: workspaceId, user: userId,
      status: 'active', kind: 'member', role: 'employee', department: [], accessType: 'full_department' });
    const login = () => fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const loginResponse = await login(); assert.equal(loginResponse.status, 200);
    const { token } = await loginResponse.json(); assert.ok(token);
    const verify = () => fetch(`${base}/api/auth/verify`, { headers: { Authorization: `Bearer ${token}`, 'x-workspace-id': String(workspaceId) } });
    assert.equal((await verify()).status, 200);

    const require = createRequire(new URL('../../desktopApp/package.json', import.meta.url));
    socket = require('socket.io-client').io(base, { autoConnect: false, transports: ['websocket'], auth: { token, workspaceId: String(workspaceId) } });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Local socket connection timed out')), 5000);
      socket.once('connect', () => { clearTimeout(timeout); resolve(); });
      socket.once('connect_error', error => { clearTimeout(timeout); reject(error); }); socket.connect();
    });
    socket.disconnect();

    const activity = { workspaceId: String(workspaceId), user: String(userId), type: 'card_created', description: 'Delayed local audit activity', contextType: 'card' };
    child.send({ activity });
    await eventually(async () => assert.equal(await mongoose.connection.collection('activities').countDocuments({ description: activity.description, workspaceId }), 1));
    // Local authentication must read current MongoDB state on every request.
    await mongoose.connection.collection('workspacememberships').updateOne({ workspace: workspaceId, user: userId }, { $set: { status: 'suspended' } });
    assert.equal((await verify()).status, 403);
    for (let i = 0; i < 9; i++) assert.equal((await login()).status, 200);
    assert.equal((await login()).status, 429);

    const exited = new Promise(resolve => child.once('exit', resolve)); child.send('shutdown');
    assert.equal(await Promise.race([exited, wait(20000).then(() => 'timeout')]), 0, output);
    assert.doesNotMatch(output, /redis|reconnect|ECONNREFUSED/i);
    console.log('LOCAL_AUDIT_RESULT ' + JSON.stringify({ realStartup: true, workers: 10, localConnections: 0,
      jwtLogin: true, localSockets: true, delayedDatabaseJob: true, freshMembershipReads: true,
      rateLimit429: true, cleanShutdown: true, noRedisLogs: true }));
  } catch (error) {
    console.error('Local verification failed:', error.message, '\nBackend output:\n', output);
    process.exitCode = 1;
  } finally {
    socket?.disconnect(); if (child?.exitCode === null) child.kill();
    await mongoose?.disconnect(); await db?.stop();
  }
}
