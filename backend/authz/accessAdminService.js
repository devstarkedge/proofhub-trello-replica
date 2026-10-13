import WorkspaceMembership from '../models/WorkspaceMembership.js';
import Workspace from '../models/Workspace.js';
import Role from '../models/Role.js';
import Department from '../models/Department.js';
import Board from '../models/Board.js';
import Team from '../models/Team.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import { invalidateAuthCache } from '../middleware/authMiddleware.js';
import { recordAuditLog } from '../modules/permissions/auditLogService.js';
import { emitToUser, getIO } from '../realtime/emitters.js';
import { ROOM } from '../realtime/events.js';
import { syncUserDepartmentRoster } from '../modules/workspaces/departmentRosterSync.js';

// Transitional single writer. V2 grants and ceiling validation are added below
// as the catalog lands; legacy controllers already stop touching User mirrors.
export async function updateMemberAccess({ workspaceId, userId, actor, patch, reason = 'Workspace member access updated', meta = {} }) {
  if (!workspaceId || !actor || String(actor._id || actor.id) === String(userId)) throw new ErrorResponse('You cannot modify your own access', 403);
  const workspace = await Workspace.findById(workspaceId).lean();
  const member = await WorkspaceMembership.findOne({ workspace: workspaceId, user: userId, status: { $ne: 'removed' } });
  if (!workspace || !member) throw new ErrorResponse('Member not found', 404);
  if (String(workspace.owner) === String(userId)) throw new ErrorResponse('Workspace owner access is locked', 403);
  const allowed = ['role', 'roleId', 'department', 'team', 'accessType', 'allowedProjects', 'status'];
  if (Object.keys(patch).some(key => !allowed.includes(key))) throw new ErrorResponse('Invalid access field', 400);
  if (member.role === 'admin' && (patch.status && patch.status !== 'active' || patch.role && patch.role !== 'admin')) {
    if (await WorkspaceMembership.countDocuments({ workspace: workspaceId, role: 'admin', status: 'active' }) <= 1) throw new ErrorResponse('Cannot remove the last active admin', 409);
  }
  if ((member.role === 'admin' || patch.role === 'admin') && actor.role !== 'admin') throw new ErrorResponse('Cannot manage admin access', 403);
  if ((member.role === 'admin' || patch.role === 'admin') && (patch.accessType && patch.accessType !== 'full_department' || patch.allowedProjects?.length)) throw new ErrorResponse('Admin access cannot be restricted', 400);
  if (patch.roleId) {
    const role = await Role.findById(patch.roleId).lean();
    if (!role?.isActive || role.workspaceId && String(role.workspaceId) !== String(workspaceId)) throw new ErrorResponse('Role not found', 404);
  }
  for (const [field, Model] of [['department', Department], ['allowedProjects', Board]]) {
    if (patch[field] !== undefined) {
      if (!Array.isArray(patch[field])) throw new ErrorResponse(`${field} must be an array`, 400);
      const ids = [...new Set(patch[field].map(String))];
      if (await Model.countDocuments({ _id: { $in: ids }, workspaceId }) !== ids.length) throw new ErrorResponse(`Invalid ${field}`, 400);
    }
  }
  if (patch.team && !await Team.exists({ _id: patch.team, workspaceId })) throw new ErrorResponse('Team not found', 404);
  const before = Object.fromEntries(allowed.map(key => [key, member.toObject()[key]]));
  Object.assign(member, patch);
  await member.save();
  if (patch.department !== undefined || patch.role !== undefined || patch.status !== undefined) {
    await syncUserDepartmentRoster({ workspaceId, userId, departmentIds: member.status === 'active' ? member.department : [], roleSlug: member.role, previousRole: before.role });
  }
  await recordAuditLog({ actor, target: { _id: userId }, action: 'MEMBER_ACCESS_CHANGED', targetType: 'WorkspaceMembership', targetId: member._id, resourceKey: 'membership', resourceLabel: 'Workspace membership', summary: reason, before, after: Object.fromEntries(allowed.map(key => [key, member.toObject()[key]])), meta: { ...meta, workspaceId } });
  invalidateAuthCache(userId);
  try {
    emitToUser(userId, 'authz:changed', { workspaceId, userId }, workspaceId);
    emitToUser(userId, 'user:access-updated', { workspaceId, userId }, workspaceId);
    emitToUser(userId, 'user-role-changed', { workspaceId, userId, previousRole: before.role, newRole: member.role, roleId: member.roleId }, workspaceId);
    // All old room permissions become invalid when access changes. Reconnect
    // rechecks membership and prevents removed users retaining subscriptions.
    getIO().in(ROOM.user(userId, workspaceId)).disconnectSockets(true);
  } catch { /* The service is also used by migrations/tests before sockets start. */ }
  return member;
}
