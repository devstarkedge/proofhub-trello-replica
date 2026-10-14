import { randomUUID } from 'node:crypto';
import { getIO } from './emitters.js';
import { ROOM } from './events.js';
import { getActiveWorkspaceId } from '../modules/workspaces/workspaceContext.js';
import logger from '../utils/logger.js';

export function publishInboxChange(userId, change, workspaceId = getActiveWorkspaceId()) {
  if (!workspaceId || !userId) throw new Error('Inbox events require recipient and workspace');
  try { getIO().to(ROOM.user(userId, workspaceId)).emit('notification-state-changed', {
    eventId: randomUUID(), schemaVersion: 1, type: 'notification-state-changed',
    workspaceId: String(workspaceId), recipientId: String(userId),
    occurredAt: new Date().toISOString(), ...change,
  }); } catch (error) {
    // HTTP writes have already committed; inbox recovery reconciles transport failures.
    logger.warn('Inbox state publication deferred to recovery', { code: error.code || error.name });
  }
}
