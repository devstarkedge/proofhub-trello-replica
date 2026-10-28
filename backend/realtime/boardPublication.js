import { randomUUID } from 'node:crypto';
import { signMediaPayload } from '../services/attachmentDelivery.js';
import { getIO } from './emitters.js';
import { ROOM } from './events.js';
import { getActiveWorkspaceId, run } from '../modules/workspaces/workspaceContext.js';
import { userCanAccessEntity } from '../utils/entityAccess.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

const queues = new Map();
const invalidations = new Map();
export async function stopBoardPublication() {
  await Promise.allSettled([...queues.values()]);
  for (const timer of invalidations.values()) clearTimeout(timer);
  invalidations.clear();
}

async function authorizedSessions(boardId, workspaceId, room) {
  const sockets = await getIO().in(room).fetchSockets();
  const userIds = [...new Set(sockets.map(socket => String(socket.data.user?.id || socket.data.user?._id || '')).filter(Boolean))];
  const [memberships, accounts] = await Promise.all([
    WorkspaceMembership.find({ workspace: workspaceId, user: { $in: userIds }, status: 'active', kind: { $ne: 'guest' } }).select('user').lean(),
    User.find({ _id: { $in: userIds }, isActive: true, forcePasswordChange: { $ne: true } }).select('_id tokenVersion').lean()
  ]);
  const members = new Set(memberships.map(member => String(member.user)));
  const users = new Map(accounts.map(user => [String(user._id), user]));
  const checks = new Map();
  for (let offset = 0; offset < userIds.length; offset += 16) {
    await Promise.all(userIds.slice(offset, offset + 16).map(async userId => {
      checks.set(userId, members.has(userId) && users.has(userId) && await userCanAccessEntity({ userId, entityType: 'Board', entityId: boardId }));
    }));
  }
  const allowed = [];
  for (const socket of sockets) {
    const userId = String(socket.data.user?.id || socket.data.user?._id || '');
    const account = users.get(userId);
    if (checks.get(userId) && socket.data.user?.tokenVersion === (account?.tokenVersion || 0) && (!socket.data.tokenExpiresAt || socket.data.tokenExpiresAt > Date.now())) allowed.push(socket);
    else if (room === ROOM.board(boardId, workspaceId)) {
      // Reauthenticate all subscriptions after project/task scope was revoked.
      getIO().to(socket.id).emit('access-changed', { workspaceId, boardId });
      socket.disconnect(true);
    }
  }
  return allowed;
}

// Recheck authorization at publication, including existing subscriptions whose
// permissions changed. Queue per board to retain ordering within this process.
export function publishBoardEvent(boardId, type, payload) {
  const workspaceId = getActiveWorkspaceId();
  if (!workspaceId) throw new Error('Board events require a workspace');
  const key = `${workspaceId}:${boardId}`;
  const previous = queues.get(key) || Promise.resolve();
  const job = previous.then(() => run({ workspaceId }, async () => {
    const ids = await authorizedSessions(boardId, workspaceId, ROOM.board(boardId, workspaceId));
    const event = {
      ...payload, boardId: String(boardId), workspaceId: String(workspaceId),
      eventId: randomUUID(), schemaVersion: 1, occurredAt: new Date().toISOString(),
    };
    const byUser = new Map();
    for (const socket of ids) {
      const key = String(socket.data.user.id || socket.data.user._id);
      if (!byUser.has(key)) byUser.set(key, { user: socket.data.user, sockets: [] });
      byUser.get(key).sockets.push(socket.id);
    }
    for (const audience of byUser.values()) getIO().to(audience.sockets).emit(type, signMediaPayload(event, audience.user, workspaceId, process.env.API_PUBLIC_URL || ''));
    if (!invalidations.has(key)) {
      const timer = setTimeout(() => {
        invalidations.delete(key);
        run({ workspaceId }, async () => {
          // Only connected, currently authorized users receive invalidations;
          // no private card contents are broadcast to workspace rooms.
          const targets = await authorizedSessions(boardId, workspaceId, ROOM.workspace(workspaceId));
          if (targets.length) getIO().to(targets.map(socket => socket.id)).emit('data-changed', { workspaceId: String(workspaceId), boardId: String(boardId), resource: 'workflow', schemaVersion: 1, eventId: randomUUID() });
        }).catch(error => logger.warn('Board recovery publication failed', { code: error.code || error.name }));
      }, 250);
      timer.unref(); invalidations.set(key, timer);
    }
  })).catch(error => logger.warn('Board publication failed; recovery required', { code: error.code || error.name }));
  queues.set(key, job);
  job.finally(() => { if (queues.get(key) === job) queues.delete(key); });
  return job;
}
