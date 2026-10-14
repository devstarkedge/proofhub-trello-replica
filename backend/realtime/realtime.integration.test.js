import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
// Read-only UI fixtures never contact external chat/Slack or schedule jobs.
vi.mock('../utils/slackHooks.js', () => ({ slackHooks: {} }));
vi.mock('../utils/chatHooks.js', () => ({ chatHooks: {} }));
vi.mock('../schedulers/cardDueDateScheduler.js', () => ({ scheduleDueDateJobs: vi.fn(), cancelDueDateJobs: vi.fn() }));
vi.mock('../utils/backgroundTasks.js', () => ({ notifyProjectCreatedInBackground: vi.fn(), sendProjectEmailsInBackground: vi.fn(), logProjectActivityInBackground: vi.fn(), runBackground: vi.fn() }));
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import config from '../config/index.js';
import socketManager from './socketManager.js';
import { setIO } from './emitters.js';
import { publishBoardEvent } from './boardPublication.js';
import { publishPendingNotifications } from './notificationPublication.js';
import routes from '../routes/notifications.js';
import notificationService from '../utils/notificationService.js';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import Board from '../models/Board.js';
import Card from '../models/Card.js';
import List from '../models/List.js';
import Notification from '../models/Notification.js';
import Department from '../models/Department.js';
import { protect } from '../middleware/authMiddleware.js';
import { run } from '../modules/workspaces/workspaceContext.js';

// Use the same installed client as the desktop renderer, without a second dependency.
const { io: clientIO } = createRequire(new URL('../../desktopApp/package.json', import.meta.url))('socket.io-client');
let database, http, io, url, actor, recipient, outsider, workspace, otherWorkspace, board, task, department;
const clients = [];
const scoped = fn => run({ workspaceId: workspace._id }, async () => await fn());
const token = (user, expiresIn = '1h') => jwt.sign({ id: String(user._id) }, config.jwt.secret, { expiresIn });
const once = (socket, name) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => { socket.off(name, receive); reject(new Error(`Timed out: ${name}`)); }, 7000);
  const receive = value => { clearTimeout(timeout); resolve(value); };
  socket.once(name, receive);
});
async function connect(user, ws = workspace, extra = {}) {
  const socket = clientIO(url, { auth: { token: token(user), workspaceId: String(ws._id), ...extra }, transports: ['websocket'], reconnection: false, autoConnect: false });
  clients.push(socket);
  const connected = once(socket, 'connect'); socket.connect(); await connected;
  return socket;
}
async function request(path, { user = recipient, ws = workspace, method = 'GET' } = {}) {
  return fetch(url + '/api/notifications' + path, { method, headers: { Authorization: `Bearer ${token(user)}`, 'x-workspace-id': String(ws._id) } });
}

beforeAll(async () => {
  database = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(database.getUri(), { dbName: 'flowtask-realtime-integration' });
  [actor, recipient, outsider] = await Promise.all(['Actor', 'Recipient', 'Outsider'].map(name => User.create({ name, email: `${name.toLowerCase()}@realtime.test`, password: 'isolated-test-password', isActive: true, isVerified: true, settings: { notifications: { email: false, push: false } } })));
  workspace = await Workspace.create({ name: 'Realtime A', slug: 'realtime-a', owner: actor._id });
  otherWorkspace = await Workspace.create({ name: 'Realtime B', slug: 'realtime-b', owner: outsider._id });
  await WorkspaceMembership.create([
    { workspace: workspace._id, user: actor._id, role: 'admin' },
    { workspace: workspace._id, user: recipient._id, role: 'employee' },
    { workspace: workspace._id, user: outsider._id, role: 'employee' },
    { workspace: otherWorkspace._id, user: recipient._id, role: 'employee' },
  ]);
  await scoped(async () => {
    department = await Department.create({ name: 'Design', managers: [actor._id], members: [recipient._id] });
    board = await Board.create({ name: 'Website Redesign', department: department._id, owner: actor._id, members: [recipient._id], visibility: 'private' });
    const list = await List.create({ title: 'To Do', board: board._id, position: 0 });
    task = await Card.create({ title: 'Homepage Design', board: board._id, list: list._id, assignees: [recipient._id], createdBy: actor._id });
  });
  const app = express(); app.use(express.json()); app.use('/api/notifications', routes);
  const boards = await import('../controllers/boardController.js');
  const cards = await import('../controllers/cardController.js');
  app.get('/api/boards/:id/workflow-complete', protect, boards.getWorkflowComplete);
  app.get('/api/boards/:id', protect, boards.getBoard);
  app.get('/api/cards/:id', protect, cards.getCard);
  app.get('/test/session', async (req, res) => {
    const user = await User.findById(recipient._id).lean();
    res.json({ token: token(recipient), user: { _id: String(user._id), id: String(user._id), name: user.name, role: 'employee', settings: user.settings }, workspace, department });
  });
  app.post('/test/publish', async (req, res, next) => {
    try {
      const record = await scoped(async () => {
        if (req.query.mode === 'update') {
          await Card.updateOne({ _id: task._id }, { $set: { title: 'Server title update' } });
          await publishBoardEvent(board._id, 'card-updated', { cardId: String(task._id), updates: { title: 'Server title update' } });
          return { updated: true };
        }
        return notificationService.createNotification({ type: req.query.mode === 'assigned' ? 'task_assigned' : 'system_alert', title: 'Task Assigned', message: 'Homepage Design', user: recipient._id, sender: actor._id, relatedCard: task._id, relatedBoard: board._id, taskId: task._id, projectId: board._id, departmentId: department._id });
      });
      res.json(record);
    } catch (error) { next(error); }
  });
  // Auxiliary collections are empty in this isolated fixture. Entity and inbox
  // reads above use the real protected controllers and database.
  app.get('/api/departments/with-assignments', protect, (req, res) => res.json({ success: true, data: [{ ...department.toObject(), projects: [board], membersWithAssignments: [], projectsWithMemberAssignments: {} }] }));
  app.get('/api/departments', protect, (req, res) => res.json({ success: true, data: [department] }));
  app.get('/api/lists/board/:id', protect, async (req, res) => res.json({ success: true, data: await List.find({ board: req.params.id }).lean() }));
  app.get('/api/*', protect, (req, res) => res.json({ success: true, data: [], permissions: {}, resources: {}, access: {}, settings: {} }));
  app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ message: error.message }));
  http = createServer(app); io = socketManager.init(http);
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${http.address().port}`;
}, 60000);

afterAll(async () => {
  clients.forEach(socket => socket.disconnect());
  if (io) await new Promise(resolve => io.close(resolve));
  // Drain the bounded board invalidation before tearing down the isolated DB.
  await new Promise(resolve => setTimeout(resolve, 400));
  await mongoose.disconnect();
  if (database) await database.stop();
}, 15000);

describe('Authenticated persisted multi-session notification delivery', () => {
  it('delivers task assignment once to both intended sessions, never another user or workspace; read state synchronizes', async () => {
    const first = await connect(recipient), second = await connect(recipient);
    const wrongUser = await connect(outsider), wrongWorkspace = await connect(recipient, otherWorkspace);
    const leaked = []; wrongUser.on('notification', value => leaked.push(value)); wrongWorkspace.on('notification', value => leaked.push(value));
    const events = [once(first, 'notification'), once(second, 'notification')];
    const created = await scoped(() => notificationService.notifyTaskAssigned(task, recipient._id, actor._id));
    const [a, b] = await Promise.all(events);
    expect(created).toHaveLength(1); expect(a._id).toBe(b._id); expect(a.eventId).toBe(a._id);
    expect(a.workspaceId).toBe(String(workspace._id)); expect(a.recipientId).toBe(String(recipient._id));
    expect(String(a.taskId)).toBe(String(task._id));
    expect(await scoped(() => Notification.countDocuments({ user: recipient._id }))).toBe(1);
    const changes = [once(first, 'notification-state-changed'), once(second, 'notification-state-changed')];
    expect((await request(`/${a._id}/read`, { method: 'PUT' })).status).toBe(200);
    await Promise.all(changes);
    expect((await (await request('/unread-count')).json()).count).toBe(0);
    expect((await request(`/${a._id}`, { user: outsider })).status).toBe(404);
    expect((await request(`/${a._id}`, { ws: otherWorkspace })).status).toBe(404);
    expect(leaked).toHaveLength(0);
  });

  it('recovers disconnected notifications from the inbox and bounds pagination', async () => {
    const record = await scoped(() => notificationService.createNotification({ type: 'system_alert', title: 'Offline update', message: 'Durable recovery', user: recipient._id, sender: actor._id }));
    const resumed = await connect(recipient); expect(resumed.connected).toBe(true);
    const response = await request('/?limit=100000&skip=-1'); const body = await response.json();
    expect(response.status).toBe(200); expect(body.pagination.limit).toBe(100); expect(body.pagination.skip).toBe(0);
    expect(body.notifications.some(item => item._id === String(record._id))).toBe(true);
  });

  it('retries the same persisted record after transport failure without creating another notification', async () => {
    const first = await connect(recipient); const received = once(first, 'notification');
    setIO({ to() { throw new Error('isolated transport outage'); } });
    const record = await scoped(() => notificationService.createNotification({ type: 'system_alert', title: 'Retry', message: 'Persist before publishing', user: recipient._id }));
    expect(record).toBeTruthy();
    expect((await scoped(() => Notification.findById(record._id).lean())).deliveryPending).toBe(true);
    setIO(io); await publishPendingNotifications();
    expect((await received)._id).toBe(String(record._id));
    await publishPendingNotifications();
    expect(await scoped(() => Notification.countDocuments({ _id: record._id }))).toBe(1);
    expect((await scoped(() => Notification.findById(record._id).lean())).deliveryPending).toBe(false);
  });

  it('rejects forged workspace membership and disconnects expired credentials', async () => {
    const forged = clientIO(url, { auth: { token: token(actor), workspaceId: String(otherWorkspace._id), userId: String(recipient._id) }, transports: ['websocket'], reconnection: false, autoConnect: false });
    clients.push(forged); const rejected = once(forged, 'connect_error'); forged.connect();
    expect((await rejected).message).toBe('Not a member of this workspace');
    const expiring = await connect(recipient, workspace, { token: token(recipient, 2) });
    expect(await once(expiring, 'disconnect')).toBe('io server disconnect');
  });

  it('observes the real Electron renderer, dropdown, exact task modal, live board and secure native click handlers', async () => {
    await User.updateOne({ _id: recipient._id }, { $set: { 'settings.notifications.push': true } });
    const desktop = fileURLToPath(new URL('../../desktopApp/', import.meta.url));
    const require = createRequire(path.join(desktop, 'package.json'));
    const { createServer: createVite } = await import(require.resolve('vite'));
    const { default: react } = await import(require.resolve('@vitejs/plugin-react'));
    const { default: tailwind } = await import(require.resolve('@tailwindcss/vite'));
    const vite = await createVite({ configFile: false, root: desktop, cacheDir: path.join(desktop, 'node_modules/.vite/realtime-integration'), plugins: [react(), tailwind()],
      define: { 'import.meta.env.VITE_BACKEND_URL': 'globalThis.location.origin' },
      resolve: { dedupe: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query', 'react-toastify'] },
      server: { host: '127.0.0.1', port: 0, fs: { allow: [fileURLToPath(new URL('../../', import.meta.url))] }, proxy: { '/api': url, '/test': url, '/socket.io': { target: url, ws: true } } },
    });
    const html = path.join(desktop, 'artifacts/realtime-fixture.html');
    await fs.writeFile(html, `<html><head></head><body><div id="root"></div><script type="module" src="/@fs/${fileURLToPath(new URL('./renderer.fixture.jsx', import.meta.url)).replaceAll('\\', '/')}"></script></body></html>`);
    let child;
    try {
      await vite.listen();
      const port = vite.httpServer.address().port;
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
      child = spawn(require('electron'), [fileURLToPath(new URL('./renderer.electron.cjs', import.meta.url)), `http://127.0.0.1:${port}/artifacts/realtime-fixture.html`], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
      const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
      const line = output.split(/\r?\n/).find(line => line.startsWith('FLOWTASK_RENDERER_RESULT '));
      if (code !== 0 || !line) throw new Error(output.slice(-10000));
      const result = JSON.parse(line.replace('FLOWTASK_RENDERER_RESULT ', ''));
      expect(result.exactTaskModal).toBe(true); expect(result.draftPreserved).toBe(true); expect(result.rendererErrors).toEqual([]);
      console.log('Electron integrated verification:', JSON.stringify(result));
    } finally { child?.kill(); await vite.close(); await fs.rm(html, { force: true }); }
  }, 120000);

  it('delivers board updates and data invalidations only while current access allows them', async () => {
    const allowed = await connect(recipient), denied = await connect(outsider);
    allowed.emit('join-board', String(board._id)); denied.emit('join-board', String(board._id));
    await new Promise(resolve => setTimeout(resolve, 150));
    const leaked = []; denied.on('card-updated', value => leaked.push(value)); denied.on('data-changed', value => leaked.push(value));
    const changed = once(allowed, 'card-updated'), invalidated = once(allowed, 'data-changed');
    await scoped(() => publishBoardEvent(board._id, 'card-updated', { cardId: String(task._id), updates: { title: 'Latest title' } }));
    expect((await changed).updates.title).toBe('Latest title'); expect((await invalidated).boardId).toBe(String(board._id));
    await scoped(async () => { await Board.updateOne({ _id: board._id }, { $set: { members: [] } }); await Card.updateOne({ _id: task._id }, { $set: { assignees: [] } }); });
    const revoked = once(allowed, 'access-changed');
    await scoped(() => publishBoardEvent(board._id, 'card-updated', { cardId: String(task._id), updates: { title: 'Private after removal' } }));
    expect((await revoked).boardId).toBe(String(board._id)); expect(leaked).toHaveLength(0);
    const blocked = await scoped(() => notificationService.createNotification({ type: 'task_updated', title: 'Private', message: 'No longer permitted', user: recipient._id, relatedCard: task._id }));
    expect(blocked).toBeNull();
  });
});
