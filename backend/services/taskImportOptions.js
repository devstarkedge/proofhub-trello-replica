import Card from '../models/Card.js';
import List from '../models/List.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import Workspace from '../models/Workspace.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import Department from '../models/Department.js';
import PermissionOverride from '../models/PermissionOverride.js';
import { contextFromRecords } from '../authz/context.js';
import { can } from '../authz/engine.js';
import { canUserAccessBoard } from '../utils/boardAccess.js';
import { assignedWorkOnly } from '../../shared/assignedWorkAccess.mjs';
import { assigneeEmails } from './taskImportWorkbook.js';
import { ErrorResponse } from '../middleware/errorHandler.js';

const id = value => String(value?._id || value || '');

// Card's enum is authoritative for task priorities (Board.priority is a
// separate project-level field). No new priority configuration or cache layer.
export function taskImportPriorities() {
  return Card.schema.path('priority').enumValues.filter(value => typeof value === 'string' && value).map(value => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }));
}

async function projectAssigneeIds(project, workspaceId, candidates) {
  if (candidates?.length === 0) return new Set();
  const scope = { workspaceId, board: project._id };
  if (candidates) scope.assignees = { $in: candidates };
  const assignments = await Promise.all([
    Card.distinct('assignees', { ...scope, isArchived: { $ne: true } }),
    Subtask.distinct('assignees', scope),
    SubtaskNano.distinct('assignees', scope),
  ]);
  return new Set(assignments.flat().filter(Boolean).map(id));
}

async function projectRecipientCandidates(project, workspaceId, emails) {
  const directMembers = new Set([project.owner, ...(project.members || [])].filter(Boolean).map(id));
  if (emails) {
    // The worker only needs the people named on this row. Check their project
    // assignments in a batch, and skip those reads for direct members.
    const requested = await User.find({ email: { $in: emails }, isActive: true }).select('name email').lean();
    const candidates = requested.filter(user => !directMembers.has(id(user))).map(user => user._id);
    const assignedUsers = await projectAssigneeIds(project, workspaceId, candidates);
    const users = requested.filter(user => directMembers.has(id(user)) || assignedUsers.has(id(user)));
    return { users, assignedUsers };
  }

  const assignedUsers = await projectAssigneeIds(project, workspaceId);
  const candidateIds = [...new Set([...directMembers, ...assignedUsers])];
  const users = candidateIds.length
    ? await User.find({ _id: { $in: candidateIds }, isActive: true }).select('name email').lean()
    : [];
  return { users, assignedUsers };
}

export async function taskImportOptions(project, workspaceId, { assigneesValue } = {}) {
  if (!project || id(project.workspaceId) !== id(workspaceId)) throw new ErrorResponse('Project not found', 404);
  const emails = assigneesValue === undefined ? null : assigneeEmails(assigneesValue);
  const [lists, { users, assignedUsers }] = await Promise.all([
    List.find({ board: project._id, workspaceId, isArchived: false }).select('title board').sort('position').lean(),
    emails?.length === 0 ? { users: [], assignedUsers: new Set() } : projectRecipientCandidates(project, workspaceId, emails),
  ]);
  const options = { lists, statuses: lists.map(list => list.title), priorities: taskImportPriorities(), assignees: [] };
  if (!users.length) return options;
  const userIds = users.map(user => user._id);
  const memberships = await WorkspaceMembership.find({ workspace: workspaceId, user: { $in: userIds }, role: { $nin: ['admin', 'manager', 'hr', 'guest'] }, status: 'active', kind: { $ne: 'guest' } }).select('user role roleId kind status department departments allowedProjects restriction accessType').lean();
  if (!memberships.length) return options;
  const roleIds = memberships.map(member => member.roleId).filter(Boolean);
  const v2 = process.env.AUTHZ_V2 === 'enforce';
  // Resolve role, restrictions and deny overrides in batches, reusing the
  // canonical evaluator. Never use global User.role as tenant authorization.
  const [roles, workspace, departments, overrides] = await Promise.all([
    roleIds.length ? Role.find({ _id: { $in: roleIds } }).lean() : [],
    v2 ? Workspace.findById(workspaceId).select('owner isActive status').lean() : null,
    v2 ? Department.find({ workspaceId, managers: { $in: userIds }, isActive: { $ne: false } }).select('_id managers').lean() : [],
    v2 ? PermissionOverride.find({ workspace: workspaceId, user: { $in: userIds }, permission: 'project.view', status: 'active' }).lean() : [],
  ]);
  const roleById = new Map(roles.map(role => [id(role._id), role]));
  const memberByUser = new Map(memberships.map(member => [id(member.user), member]));
  const overridesByUser = new Map();
  for (const record of overrides) {
    const userId = id(record.user);
    if (!overridesByUser.has(userId)) overridesByUser.set(userId, []);
    overridesByUser.get(userId).push(record);
  }
  const projectId = id(project._id);
  const assignmentFacts = { activeAssignedBoardIds: new Set([projectId]), assignedBoardIds: new Set([projectId]) };
  for (const user of users) {
    const userId = id(user._id);
    const membership = memberByUser.get(userId);
    if (!membership || !user.email) continue;
    const role = roleById.get(id(membership.roleId));
    if (membership.roleId && (!role?.isActive || v2 && id(role.workspaceId) !== id(workspaceId))) continue;
    const roleKey = role?.key || role?.slug || membership.role;
    if (['admin', 'manager', 'hr', 'guest'].includes(membership.role) || ['admin', 'manager', 'hr', 'guest'].includes(roleKey) || role?.kind === 'guest') continue;
    if (role?.isSystem ? roleKey !== 'employee' : !role && membership.role !== 'employee') continue;
    // An existing task assignment establishes project participation. A direct
    // member with Assigned Work can also receive their first task. These facts
    // are local to recipient validation and never grant project read access.
    const alreadyAssigned = assignedUsers.has(userId);
    let allowed;
    if (v2) {
      const ctx = contextFromRecords({ userId, workspace, membership, role, departments, overrides: overridesByUser.get(userId) || [] });
      if (alreadyAssigned || assignedWorkOnly(ctx)) ctx.assignedProjectIds = [projectId];
      allowed = can(ctx, 'project.view', project);
    } else allowed = await canUserAccessBoard(project, { ...user, ...membership, _id: user._id, id: id(user._id), workspaceId },
      alreadyAssigned || assignedWorkOnly(membership) ? assignmentFacts : null);
    if (!allowed) continue;
    options.assignees.push({ id: userId, email: user.email.toLowerCase(), label: `${(user.name || user.email).replaceAll(';', ',')} <${user.email}>` });
  }
  options.assignees.sort((left, right) => left.label.localeCompare(right.label));
  return options;
}
