import { randomUUID } from 'node:crypto';
import { getIO } from './emitters.js';
import { ROOM } from './events.js';
import { getActiveWorkspaceId, run } from '../modules/workspaces/workspaceContext.js';
import { userCanAccessEntity } from '../utils/entityAccess.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
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
  const checks = new Map();
  const allowed = [];
  for (const socket of sockets) {
    const userId = socket.data.user?.id || socket.data.user?._id;
    if (!userId) continue;
    if (!checks.has(String(userId))) checks.set(String(userId), (async () => {
      const member = await WorkspaceMembership.exists({ workspace: workspaceId, user: userId, status: 'active', kind: { $ne: 'guest' } });
      return member && await userCanAccessEntity({ userId, entityType: 'Board', entityId: boardId });
    })());
    if (await checks.get(String(userId))) allowed.push(socket.id);
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
    if (ids.length) getIO().to(ids).emit(type, {
      ...payload, boardId: String(boardId), workspaceId: String(workspaceId),
      eventId: randomUUID(), schemaVersion: 1, occurredAt: new Date().toISOString(),
    });
    if (!invalidations.has(key)) {
      const timer = setTimeout(() => {
        invalidations.delete(key);
        run({ workspaceId }, async () => {
          // Only connected, currently authorized users receive invalidations;
          // no private card contents are broadcast to workspace rooms.
          const targets = await authorizedSessions(boardId, workspaceId, ROOM.workspace(workspaceId));
          if (targets.length) getIO().to(targets).emit('data-changed', { workspaceId: String(workspaceId), boardId: String(boardId), resource: 'workflow', schemaVersion: 1, eventId: randomUUID() });
        }).catch(error => logger.warn('Board recovery publication failed', { code: error.code || error.name }));
      }, 250);
      timer.unref(); invalidations.set(key, timer);
    }
  })).catch(error => logger.warn('Board publication failed; recovery required', { code: error.code || error.name }));
  queues.set(key, job);
  job.finally(() => { if (queues.get(key) === job) queues.delete(key); });
  return job;
}
