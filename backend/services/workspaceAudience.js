import WorkspaceMembership from '../models/WorkspaceMembership.js';
import User from '../models/User.js';
import { getActiveWorkspaceId } from '../modules/workspaces/workspaceContext.js';

import Department from '../models/Department.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';

export async function workspacePerson(userId, workspaceId = getActiveWorkspaceId()) {
  if (!workspaceId) return null;
  const membership = await WorkspaceMembership.findOne({ user: userId, workspace: workspaceId, status: 'active' }).lean();
  if (!membership) return null;
  const user = await User.findOne({ _id: userId, isActive: true }).select('_id name email').lean();
  return user ? { ...user, workspaceId, role: membership.role, roleId: membership.roleId, department: membership.departments ?? membership.department ?? [], team: membership.team, accessType: membership.accessType, allowedProjects: membership.allowedProjects || [] } : null;
}

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
  const userIds = memberships.map(m => m.user);

  const [users, departments] = await Promise.all([
    User.find({ _id: { $in: userIds }, isActive: true }).select('_id name email avatar title isVerified').lean(),
    workspaceContext.runUnscoped(async () => Department.find({ workspaceId, isActive: true }).select('_id name').lean())
  ]);

  const deptMap = new Map((departments || []).map(d => [String(d._id), { _id: d._id, name: d.name }]));
  return users.map(user => {
    const m = byUser.get(String(user._id));
    const resolvedDepts = [];
    const seenDeptIds = new Set();

    const rawMembershipDepts = m?.departments ?? m?.department ?? [];

    for (const d of rawMembershipDepts) {
      const dId = String(d?._id || d);
      if (deptMap.has(dId) && !seenDeptIds.has(dId)) {
        seenDeptIds.add(dId);
        resolvedDepts.push(deptMap.get(dId));
      }
    }

    return {
      ...user,
      workspaceId: String(workspaceId),
      role: m?.role,
      roleId: m?.roleId,
      department: resolvedDepts,
      departments: resolvedDepts,
      team: m?.team || null,
      accessType: m?.accessType,
      allowedProjects: m?.allowedProjects || []
    };
  });
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
