import WorkspaceMembership from '../models/WorkspaceMembership.js';
import User from '../models/User.js';
import { getActiveWorkspaceId } from '../modules/workspaces/workspaceContext.js';

export async function workspaceMemberIds(filter = {}, workspaceId = getActiveWorkspaceId()) {
  if (!workspaceId) return [];
  return WorkspaceMembership.distinct('user', { ...filter, workspace: workspaceId, status: 'active', kind: { $ne: 'guest' } });
}

export async function workspaceAdmins(workspaceId = getActiveWorkspaceId()) {
  const ids = await workspaceMemberIds({ role: 'admin' }, workspaceId);
  return User.find({ _id: { $in: ids }, isActive: true }).select('_id name email').lean();
}

export async function workspacePeople(filter = {}, workspaceId = getActiveWorkspaceId()) {
  if (!workspaceId) return [];
  const memberships = await WorkspaceMembership.find({ ...filter, workspace: workspaceId, status: 'active', kind: { $ne: 'guest' } }).lean();
  const byUser = new Map(memberships.map(m => [String(m.user), m]));
  const users = await User.find({ _id: { $in: memberships.map(m => m.user) }, isActive: true }).select('_id name email avatar title isVerified').lean();
  return users.map(user => { const m = byUser.get(String(user._id)); return { ...user, workspaceId: String(workspaceId), role: m.role, roleId: m.roleId, department: m.departments || m.department || [], team: m.team, accessType: m.accessType, allowedProjects: m.allowedProjects || [] }; });
}

export async function announcementAudience(subscribers, workspaceId = getActiveWorkspaceId()) {
  const filter = {};
  if (subscribers.type === 'departments') filter.department = { $in: subscribers.departments || [] };
  else if (subscribers.type === 'managers') filter.role = 'manager';
  else if (['users', 'custom'].includes(subscribers.type)) filter.user = { $in: (subscribers.users || []).map(u => u._id || u) };
  else if (subscribers.type !== 'all') return [];
  const ids = await workspaceMemberIds(filter, workspaceId);
  return User.distinct('_id', { _id: { $in: ids }, isActive: true, isVerified: true });
}
