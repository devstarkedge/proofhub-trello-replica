import Board from '../../models/Board.js';
import Card from '../../models/Card.js';
import Subtask from '../../models/Subtask.js';
import SubtaskNano from '../../models/SubtaskNano.js';
import User from '../../models/User.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import Workspace from '../../models/Workspace.js';
import Role from '../../models/Role.js';
import Department from '../../models/Department.js';
import PermissionOverride from '../../models/PermissionOverride.js';
import { contextFromRecords } from '../../authz/context.js';
import { can } from '../../authz/engine.js';

function toId(value) {
  if (!value) return null;
  return (value._id || value.id || value).toString();
}

function addSource(sourceMap, values, source) {
  for (const value of values || []) {
    const id = toId(value);
    if (!id) continue;
    if (!sourceMap.has(id)) sourceMap.set(id, new Set());
    sourceMap.get(id).add(source);
  }
}

export function buildProjectParticipantRecords(groups, users) {
  const sources = new Map();
  addSource(sources, [groups.owner], 'project_owner');
  addSource(sources, groups.members, 'project');
  addSource(sources, groups.managers, 'project_manager');
  addSource(sources, groups.explicitUsers, 'project_access');
  addSource(sources, groups.taskAssignees, 'task');
  addSource(sources, groups.taskMembers, 'task_member');
  addSource(sources, groups.subtaskAssignees, 'subtask');
  addSource(sources, groups.nanoAssignees, 'nano_subtask');

  return (users || [])
    .map((user) => {
      const flowTaskUserId = toId(user);
      if (!flowTaskUserId || !sources.has(flowTaskUserId)) return null;
      return {
        flowTaskUserId,
        name: user.name,
        email: user.email?.trim().toLowerCase() || '',
        avatar: user.avatar || null,
        role: user.role || 'employee',
        isActive: user.isActive !== false,
        isVerified: user.isVerified === true,
        sources: [...sources.get(flowTaskUserId)].sort(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.flowTaskUserId.localeCompare(b.flowTaskUserId));
}

/**
 * Calculate the exact user union for one project. This is intentionally used
 * only for membership-changing operations and explicit reconciliation; normal
 * task edits do not trigger hierarchy scans.
 */
export async function getProjectMembershipSnapshot(
  boardId,
  { incrementVersion = false } = {},
) {
  const boardQuery = incrementVersion
    ? Board.findOneAndUpdate(
        { _id: boardId, isDeleted: { $ne: true } },
        { $inc: { chatMembershipVersion: 1 } },
        { new: true },
      )
    : Board.findOne({ _id: boardId, isDeleted: { $ne: true } });

  const board = await boardQuery
    .select('name description department team owner members managers visibility isArchived chatMembershipVersion updatedAt workspaceId')
    .lean();

  if (!board) return null;

  const [taskAssignees, taskMembers, subtaskAssignees, nanoAssignees] = await Promise.all([
    Card.distinct('assignees', { board: board._id, isArchived: { $ne: true } }),
    Card.distinct('members', { board: board._id, isArchived: { $ne: true } }),
    Subtask.distinct('assignees', { board: board._id }),
    SubtaskNano.distinct('assignees', { board: board._id }),
  ]);

  const groups = {
    owner: board.owner,
    members: board.members,
    managers: board.managers,
    taskAssignees,
    taskMembers,
    subtaskAssignees,
    nanoAssignees,
  };
  const participantIds = new Set();
  for (const values of [
    [groups.owner],
    groups.members,
    groups.managers,
    groups.taskAssignees,
    groups.taskMembers,
    groups.subtaskAssignees,
    groups.nanoAssignees,
  ]) {
    for (const value of values || []) {
      const id = toId(value);
      if (id) participantIds.add(id);
    }
  }

  const isPrivate = board.visibility === 'private';
  const matches = [{ user: { $in: [...participantIds] } }];
  if (isPrivate) matches.push({ allowedProjects: board._id }, { 'restriction.type': 'selected_projects', 'restriction.projectIds': board._id });
  const memberships = participantIds.size || isPrivate ? await WorkspaceMembership.find({
    workspace: board.workspaceId, $or: matches, status: 'active', ...(isPrivate && { kind: { $ne: 'guest' } })
  }).select('user role roleId kind status department departments allowedProjects restriction accessType').lean() : [];
  const boardIdString = String(board._id);
  const matchesProject = ids => (ids || []).some(value => toId(value) === boardIdString);
  const explicit = member => member.restriction?.type === 'selected_projects'
    ? matchesProject(member.restriction.projectIds) : matchesProject(member.allowedProjects);
  groups.explicitUsers = isPrivate ? memberships.filter(explicit).map(member => member.user) : [];
  let eligible = isPrivate ? memberships.filter(member => (member.restriction?.type || member.accessType) === 'selected_projects'
    ? explicit(member) : participantIds.has(toId(member.user)) || explicit(member)) : memberships;
  if (isPrivate && eligible.length && process.env.AUTHZ_V2 === 'enforce') {
    const [workspace, roles, department, overrides] = await Promise.all([
      Workspace.findById(board.workspaceId).select('owner isActive status').lean(),
      Role.find({ workspaceId: board.workspaceId, _id: { $in: eligible.map(member => member.roleId).filter(Boolean) } }).lean(),
      Department.findOne({ _id: board.department, isActive: { $ne: false } }).select('managers').lean(),
      PermissionOverride.find({ workspace: board.workspaceId, user: { $in: eligible.map(member => member.user) },
        permission: 'project.view', status: 'active' }).lean()
    ]);
    const rolesById = new Map(roles.map(role => [toId(role), role]));
    const overridesByUser = new Map();
    for (const override of overrides) {
      const key = toId(override.user);
      if (!overridesByUser.has(key)) overridesByUser.set(key, []);
      overridesByUser.get(key).push(override);
    }
    const assignedUsers = new Set([taskAssignees, taskMembers, subtaskAssignees, nanoAssignees].flat().map(toId));
    eligible = eligible.filter(member => {
      const userId = toId(member.user);
      const ctx = contextFromRecords({ userId, workspace, membership: member, role: rolesById.get(toId(member.roleId)),
        departments: department ? [department] : [], overrides: overridesByUser.get(userId) || [] });
      if (assignedUsers.has(userId)) ctx.assignedProjectIds = [boardIdString];
      return can(ctx, 'project.view', board);
    });
  }
  const roles = new Map(eligible.map(row => [String(row.user), row.role]));
  const users = eligible.length ? await User.find({ _id: { $in: eligible.map(row => row.user) }, isActive: true })
    .select('name email avatar isActive isVerified').lean() : [];

  const participants = buildProjectParticipantRecords(groups, users.map(user => ({ ...user, role: roles.get(String(user._id)) })));

  return {
    project: {
      id: board._id.toString(),
      workspaceId: board.workspaceId?.toString() || null,
      name: board.name,
      description: board.description || '',
      department: toId(board.department),
      team: toId(board.team),
      owner: participants.some(row => row.flowTaskUserId === toId(board.owner)) ? toId(board.owner) : null,
      sourceVisibility: board.visibility || 'public',
      sourceUpdatedAt: board.updatedAt,
      channelVisibility: 'private',
      isArchived: board.isArchived === true,
    },
    membershipVersion: board.chatMembershipVersion || 0,
    calculatedAt: new Date().toISOString(),
    participants,
  };
}

export default { getProjectMembershipSnapshot };
