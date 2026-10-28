import mongoose from 'mongoose';
import Role from '../models/Role.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import RecurringTask from '../models/RecurringTask.js';
import { loadResource, loadAssignments } from '../authz/loaders.js';
import { buildContext } from '../authz/context.js';
import { can } from '../authz/engine.js';
import { canUserAccessBoard } from '../utils/boardAccess.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import { processTimeEntriesWithOwnership } from '../utils/timeEntryUtils.js';

const legacyPermissions = {
  'project.create': 'canCreateProject', 'project.delete': 'canDeleteProjects', 'project.restore': 'canDeleteProjects',
  'project.manage_members': 'canAssignMembers', 'task.create': 'canCreateTask',
  'task.delete': 'canDeleteTasks', 'task.edit_priority': 'canEditPriority',
  'task.edit_dates': 'canEditDates', 'task.assign': 'canAssignMembers',
  'attachment.upload': 'canManageAttachments', 'attachment.manage': 'canManageAttachments'
};
const id = value => String(value?._id || value || '');

async function principal(req) {
  if (req.projectPrincipal) return;
  if (!req.workspaceId || !req.user) throw new ErrorResponse('Workspace membership required', 403);
  const membership = req.workspaceMembership || await WorkspaceMembership.findOne({ workspace: req.workspaceId, user: req.user._id || req.user.id, status: 'active' }).lean();
  if (!membership || String(membership.workspace) !== String(req.workspaceId) || String(membership.user) !== id(req.user._id || req.user.id)) throw new ErrorResponse('Workspace membership required', 403);
  req.user = { ...req.user, role: membership.role, roleId: membership.roleId, workspaceId: req.workspaceId, department: membership.department || [], team: membership.team, accessType: membership.accessType, allowedProjects: membership.allowedProjects || [], restriction: membership.restriction, kind: membership.kind };
  req.projectPrincipal = true;
}

async function context(req) {
  if (!req.projectAuthz) {
    req.projectAuthz = await buildContext(req.user?._id || req.user?.id, req.workspaceId);
    const ctx = req.projectAuthz;
    if (ctx.restriction?.type === 'assigned_only' || [...Object.values(ctx.grants || {}), ...Object.values(ctx.denies || {})].flat().some(record => record.scope === 'assigned')) await loadAssignments(ctx);
  }
  return req.projectAuthz;
}

export async function requireProjectPermission(req, permission, resource) {
  await principal(req);
  // Employees may work on assigned tasks, but projects themselves are read-only,
  // including projects they own and permissions granted through overrides.
  const projectWrite = permission.startsWith('project.') && permission !== 'project.view';
  const projectFileWrite = ['attachment.upload', 'attachment.manage'].includes(permission) && (
    resource?.visibility || resource?.contextType === 'board' ||
    resource?.board && !resource.taskResource && !resource.card && !resource.subtask && !resource.nanoSubtask && !resource.comment
  );
  if (req.user.role === 'employee' && (projectWrite || projectFileWrite)) {
    throw new ErrorResponse('Employees have read-only project access', 403);
  }
  if (process.env.AUTHZ_V2 === 'enforce') {
    if (!can(await context(req), permission, permission.startsWith('project.') ? resource?.project || resource : resource)) throw new ErrorResponse('Permission denied', 403);
    return;
  }
  const key = legacyPermissions[permission];
  if (!key || req.user.role === 'admin') return;
  if (!req.projectRole) {
    const roleId = req.user.roleId?._id || req.user.roleId;
    req.projectRole = roleId ? await Role.findById(roleId).lean()
      : await Role.findResolvable(req.user.role, req.workspaceId).lean();
  }
  const role = req.projectRole;
  const permissions = role?.isSystem ? Role.getDefaultPermissions(role.slug) : role?.permissions;
  if (!role?.isActive || permissions?.[key] !== true) throw new ErrorResponse('Permission denied', 403);
}

/** Resolve the tenant-owned parent before any response, mutation or delivery. */
export async function authorizeProjectResource(req, type, resourceId, permission = 'task.view') {
  await principal(req);
  if (!mongoose.isValidObjectId(resourceId)) throw new ErrorResponse('Resource not found', 404);
  let resource;
  if (type === 'recurrence') {
    const recurrence = await RecurringTask.findById(resourceId).lean();
    resource = recurrence && await loadResource({ workspaceId: req.workspaceId }, 'task', recurrence.card);
  } else {
    resource = await loadResource({ workspaceId: req.workspaceId }, type, resourceId);
  }
  if (!resource) throw new ErrorResponse('Resource not found', 404);
  const project = resource.project || resource;
  if (id(project.workspaceId) !== id(req.workspaceId) || process.env.AUTHZ_V2 !== 'enforce' && !await canUserAccessBoard(permission === 'project.restore' ? { ...project, isDeleted: false } : project, req.user)) {
    throw new ErrorResponse('Resource not found', 404);
  }
  await requireProjectPermission(req, permission, resource);
  return resource;
}

export async function authorizeTaskPatch(req, type, resourceId) {
  const resource = await authorizeProjectResource(req, type, resourceId, 'task.update');
  const fields = req.body || {};
  const replacesTime = ['estimationTime', 'loggedTime', 'billedTime'].some(key => Object.hasOwn(fields, key));
  if (replacesTime && !Number.isSafeInteger(fields.expectedRevision)) throw new ErrorResponse('A current entity revision is required when replacing time entries. Refresh and retry.', 428);
  if (fields.expectedRevision !== undefined && fields.expectedRevision !== (resource.__v || 0)) throw new ErrorResponse('This item changed while you were editing it. Refresh and retry.', 409);
  req.expectedRevision = resource.__v || 0;
  delete fields.expectedRevision;
  for (const [keys, permission] of [
    [['priority'], 'task.edit_priority'], [['startDate', 'dueDate'], 'task.edit_dates'],
    [['assignee', 'assignees', 'members'], 'task.assign'],
    [['attachments'], 'attachment.manage'], [['estimationTime', 'loggedTime', 'billedTime'], 'time.log']
  ]) {
    // Sending an unchanged field is common in older clients. Enforce changes.
    if (keys.some(key => Object.hasOwn(fields, key) && JSON.stringify(fields[key]) !== JSON.stringify(resource[key]))) {
      await requireProjectPermission(req, permission, resource);
    }
  }
  return resource;
}

export function prepareTaskCreation(req) {
  for (const type of ['estimation', 'logged', 'billed']) {
    const field = `${type}Time`;
    if (req.body[field] === undefined) continue;
    if (!Array.isArray(req.body[field])) throw new ErrorResponse('Time entries must be an array', 400);
    const result = processTimeEntriesWithOwnership(req.body[field], [], { id: req.user.id, name: req.user.name }, type);
    if (result.errors.length) throw new ErrorResponse(result.errors.join('; '), 400);
    req.body[field] = result.entries;
  }
}

export async function authorizeVersion(req, mutation = false) {
  const type = { card_description: 'task', subtask_description: 'subtask', comment: 'comment' }[req.params.entityType];
  if (!type) throw new ErrorResponse('Invalid entity type', 400);
  const permission = mutation ? type === 'comment' ? 'comment.create' : 'task.update' : 'task.view';
  const resource = await authorizeProjectResource(req, type, req.params.entityId, permission);
  if (mutation && type === 'comment' && id(resource.user) !== id(req.user._id || req.user.id)) {
    throw new ErrorResponse('Only the comment author can restore its content', 403);
  }
  return resource;
}

export const authorizeContext = async (req, permission = 'task.view') => {
  await principal(req);
  const body = req.body || {};
  const params = req.params || {};
  const references = [
    ['nano', params.nanoId || params.nanoSubtaskId || body.nanoId || body.nanoSubtaskId || body.subtaskNano],
    ['subtask', params.subtaskId || body.subtaskId || body.subtask],
    ['task', params.cardId || body.cardId || body.card || body.taskId],
    ['project', params.boardId || body.boardId]
  ].filter(([, value]) => value);
  const contextRef = params.contextRef || body.contextRef;
  const contextType = params.contextType || body.contextType;
  if (contextRef) {
    if (!mongoose.isValidObjectId(contextRef)) throw new ErrorResponse('Invalid context reference', 400);
    let type = { card: 'task', subtask: 'subtask', subtaskNano: 'nano', nanoSubtask: 'nano', board: 'project' }[contextType];
    // Editors use description/comment sections across every hierarchy level;
    // an unsaved comment uses its parent as the temporary section reference.
    if (['description', 'comment'].includes(contextType)) {
      for (const candidate of ['comment', 'task', 'subtask', 'nano']) if (await loadResource({ workspaceId: req.workspaceId }, candidate, contextRef)) { type = candidate; break; }
    }
    references.push([type, contextRef]);
  }
  if (body.commentId) references.push(['comment', body.commentId]);
  if (!references.length || references.some(([type]) => !type)) throw new ErrorResponse('A valid parent context is required', 400);
  const resources = await Promise.all(references.map(([type, value]) => authorizeProjectResource(req, type, value, permission)));
  if (new Set(resources.map(resource => id((resource.project || resource)._id))).size !== 1) throw new ErrorResponse('Parent references must belong to the same project', 400);
  const roots = resources.map((resource, index) => references[index][0] === 'task' ? id(resource._id) : id(resource.taskResource?._id)).filter(Boolean);
  if (new Set(roots).size > 1) throw new ErrorResponse('Context references must belong to the same task', 400);
  return resources[0];
};
