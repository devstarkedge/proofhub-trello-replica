import { getIO } from './emitters.js';
import { ROOM } from './events.js';
import { getActiveWorkspaceId, run } from '../modules/workspaces/workspaceContext.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import Workspace from '../models/Workspace.js';
import User from '../models/User.js';
import { resolveResourceAccessBatch } from '../modules/permissions/permissionEngine.js';
import logger from '../utils/logger.js';

const queues = new Map();
export async function deliverModuleEvent(resource, event, payload, workspaceId = getActiveWorkspaceId(), { roles } = {}) {
  if (!['finance', 'sales'].includes(resource) || !workspaceId) throw new Error('Module publication requires a workspace and resource');
  return run({ workspaceId }, async () => {
    const io = getIO();
    const sockets = await io.in(ROOM[resource](workspaceId)).fetchSockets();
    if (!sockets.length) return;
    const ids = [...new Set(sockets.map(socket => String(socket.data.user?.id || socket.data.user?._id || '')).filter(Boolean))];
    const [workspace, memberships, accounts] = await Promise.all([
      Workspace.findById(workspaceId).select('isActive status settings.modules').lean(),
      WorkspaceMembership.find({ workspace: workspaceId, user: { $in: ids }, status: 'active', kind: { $ne: 'guest' } }).lean(),
      User.find({ _id: { $in: ids }, isActive: true, forcePasswordChange: { $ne: true } }).select('_id tokenVersion').lean()
    ]);
    const users = new Map(accounts.map(user => [String(user._id), user]));
    const principals = memberships.filter(member => users.has(String(member.user))).map(member => ({ ...users.get(String(member.user)), role: member.role, roleId: member.roleId, workspaceId }));
    const roleByUser = new Map(principals.map(user => [String(user._id), user.role]));
    const permissions = workspace?.isActive && !['suspended', 'archived'].includes(workspace.status) && workspace.settings?.modules?.[`${resource}Enabled`] !== false ? await resolveResourceAccessBatch(principals, resource, workspaceId) : new Map();
    const authorized = [];
    for (const socket of sockets) {
      const userId = String(socket.data.user?.id || socket.data.user?._id || '');
      const account = users.get(userId);
      const expires = socket.data.tokenExpiresAt;
      if (account && permissions.get(userId)?.actions?.view === true && socket.data.user?.tokenVersion === (account.tokenVersion || 0) && (!expires || expires > Date.now())) {
        if ((!roles || roles.includes(roleByUser.get(userId))) && (resource !== 'finance' || !event.startsWith('finance:page:') || permissions.get(userId)?.actions?.billing_details === true)) authorized.push(socket.id);
      }
      else socket.disconnect(true);
    }
    if (authorized.length) io.to(authorized).emit(event, { ...payload, workspaceId: String(workspaceId) });
  });
}

export function modulePublisher(resource, workspaceId = getActiveWorkspaceId(), options = {}) {
  return { emit(event, payload) {
    const key = `${workspaceId}:${resource}`;
    const pending = (queues.get(key) || Promise.resolve()).then(() => deliverModuleEvent(resource, event, payload, workspaceId, options))
      .catch(error => logger.warn('Module publication failed', { resource, code: error.code || error.name }));
    queues.set(key, pending);
    pending.finally(() => { if (queues.get(key) === pending) queues.delete(key); });
    return pending;
  } };
}
