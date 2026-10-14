const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function fixture() {
  const handlers = new Map(), instances = [], app = new EventEmitter(), powerMonitor = new EventEmitter();
  app.getAppPath = () => path.resolve(__dirname, '..');
  class Notification extends EventEmitter {
    static isSupported() { return true; }
    constructor(options) { super(); this.options = options; instances.push(this); }
    show() { this.displayed = true; }
    close() { this.closed = true; }
  }
  const calls = [], frame = { url: 'http://127.0.0.1:5180/' };
  const window = { webContents: { mainFrame: frame, send: (...args) => calls.push(args) },
    focused: true, minimized: false, visible: true,
    isFocused() { return this.focused; }, isMinimized() { return this.minimized; }, isVisible() { return this.visible; }, isDestroyed: () => false,
    restore() { this.minimized = false; calls.push(['restore']); }, show() { this.visible = true; }, focus() { this.focused = true; } };
  const electron = { app, powerMonitor, Notification, ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, nativeImage: { createFromPath: value => value } };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'notifications.cjs'), 'utf8'), { require: id => id === 'electron' ? electron : require(id), module, console, URL });
  module.exports.installDesktopNotifications(() => window, () => 'http://127.0.0.1:5180');
  const event = { sender: window.webContents, senderFrame: frame };
  const invoke = (name, value, sender = event) => handlers.get('desktop-notifications:' + name)(sender, value);
  const session = { userId: 'a'.repeat(24), workspaceId: 'b'.repeat(24), enabled: true };
  const notification = { ...session, id: 'c'.repeat(24), title: 'Task assigned', body: 'Homepage Design' };
  return { invoke, window, session, notification, instances, calls, event, powerMonitor };
}

test('secure native bridge: foreground/background, deduplication, click activation, logout and preferences', () => {
  const f = fixture(); f.invoke('session', f.session);
  assert.equal(f.invoke('show', f.notification), false);
  f.window.focused = false; f.window.minimized = true;
  assert.equal(f.invoke('show', f.notification), true);
  assert.equal(f.invoke('show', f.notification), false);
  assert.equal(f.instances.length, 1);
  f.instances[0].emit('click');
  assert.equal(f.window.minimized, false); assert.equal(f.window.focused, true);
  assert.equal(f.calls.at(-1)[0], 'desktop-notifications:click');
  assert.equal(f.invoke('pending'), f.notification.id); assert.equal(f.invoke('pending'), null);
  f.invoke('session', null); assert.equal(f.instances[0].closed, true);
  const count = f.calls.length; f.instances[0].emit('click'); assert.equal(f.calls.length, count);
  f.invoke('session', { ...f.session, enabled: false }); f.window.focused = false;
  assert.equal(f.invoke('show', { ...f.notification, id: 'd'.repeat(24) }), false);
  f.powerMonitor.emit('resume'); assert.equal(f.calls.at(-1)[0], 'desktop-notifications:resume');
});

test('native IPC rejects foreign frames, invalid payloads and mismatched recipient/workspace', () => {
  const f = fixture();
  assert.throws(() => f.invoke('session', f.session, { sender: f.event.sender, senderFrame: { url: 'https://foreign.test/' } }), /Untrusted/);
  assert.throws(() => f.invoke('session', { ...f.session, enabled: 'true' }), /Invalid/);
  f.invoke('session', f.session); f.window.focused = false;
  assert.equal(f.invoke('show', { ...f.notification, userId: 'd'.repeat(24) }), false);
  assert.equal(f.invoke('show', { ...f.notification, workspaceId: 'd'.repeat(24) }), false);
  assert.equal(f.invoke('show', { ...f.notification, id: '../arbitrary' }), false);
  assert.equal(f.instances.length, 0);
});

test('socket subscriptions survive initial connection, reconnect and token refresh, but clear on workspace switch/logout', () => {
  const sockets = [], events = [];
  class Socket extends EventEmitter {
    constructor() { super(); this.connected = false; this.sent = []; this.io = new EventEmitter(); }
    onAny() {}
    emit(name, ...args) { this.sent.push([name, ...args]); return true; }
    receive(name, value) { if (name === 'connect') this.connected = true; return super.emit(name, value); }
    connect() { this.connected = true; }
    disconnect() { this.connected = false; }
  }
  const source = fs.readFileSync(path.join(__dirname, '../src/services/socket.js'), 'utf8')
    .replace("import { io } from 'socket.io-client';", '')
    .replaceAll('import.meta.env', 'environment')
    .replace(/export default [^;]+;/, 'module.exports = socketService;');
  const module = { exports: {} };
  vm.runInNewContext(source, { module, console, environment: { DEV: false, VITE_BACKEND_URL: 'http://test' },
    io: () => { const socket = new Socket(); sockets.push(socket); return socket; },
    window: { dispatchEvent: event => events.push(event.type) }, CustomEvent: class { constructor(type) { this.type = type; } }, Event: class { constructor(type) { this.type = type; } },
    localStorage: { getItem: () => null } });
  const service = module.exports;
  service.joinBoard('board'); service.connect('user', 'token-1', 'workspace-a');
  sockets[0].receive('connect'); assert.equal(sockets[0].sent.filter(([type]) => type === 'join-board').length, 1);
  sockets[0].receive('connect'); assert.equal(sockets[0].sent.filter(([type]) => type === 'join-board').length, 2);
  service.connect('user', 'token-2', 'workspace-a'); sockets[1].receive('connect');
  assert.equal(sockets[1].sent.some(([type]) => type === 'join-board'), true);
  service.connect('user', 'token-2', 'workspace-b'); sockets[2].receive('connect');
  assert.equal(sockets[2].sent.some(([type]) => type === 'join-board'), false);
  service.disconnect(); assert.equal(service.rooms.size, 0);
});

test('inbox merging is bounded, deduplicated, ordered and tenant scoped; deleted and unsafe links fall back safely', async () => {
  const state = await import('../src/utils/notificationState.js');
  const routes = await import('../src/utils/notificationRouteResolver.js');
  const base = { user: 'user', workspaceId: 'workspace', type: 'task_assigned', isRead: false };
  const a = { ...base, _id: 'a', createdAt: '2026-10-14T00:00:00Z' }, b = { ...base, _id: 'b', createdAt: '2026-10-14T01:00:00Z' };
  assert.deepEqual(state.mergeNotifications([a], [a, b]).map(item => item._id), ['b', 'a']);
  assert.equal(state.mergeNotifications([a], [b], 1).length, 1);
  assert.equal(state.notificationBelongsTo(a, 'user', 'other'), false);
  assert.equal(state.notificationMatches(a, 'tasks'), true); assert.equal(state.notificationMatches({ ...a, isRead: true }, 'unread'), false);
  const target = routes.resolveNotificationRoute({ ...a, departmentId: 'department', projectId: 'project', taskId: 'task' });
  assert.equal(target.route, '/workflow/department/project/task'); assert.equal(target.openModal, 'task');
  assert.equal(routes.resolveNotificationRoute({ ...a, type: 'task_deleted', departmentId: 'department', projectId: 'project' }).openModal, null);
  assert.equal(routes.resolveNotificationRoute({ type: 'system_alert', metadata: { url: '//evil.test' } }).route, '/');
});
