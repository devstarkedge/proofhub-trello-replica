import { CATALOG } from './catalog.js';
import { assignedWorkOnly, assignedWorkTask } from '../../shared/assignedWorkAccess.mjs';

export const id = value => String(value?._id || value || '');
const includes = (values, value) => (values || []).some(item => id(item) === id(value));
const current = (record, now) => !record.expiresAt || new Date(record.expiresAt).getTime() > now;
const records = value => !value ? [] : Array.isArray(value) ? value : [value];
const mapGet = (map, key) => map instanceof Map ? map.get(key) : map?.[key];
const assigned = (ctx, resource) => includes(resource.assignees, ctx.userId) || includes(resource.members, ctx.userId) || includes(ctx.assignedTaskIds, resource._id) || includes(ctx.assignedTaskIds, resource.task?._id || resource.task || resource.card?._id || resource.card);
const projectOf = resource => resource?.project || (resource?.board && typeof resource.board === 'object' && resource.board.visibility ? resource.board : null) || (resource?.visibility ? resource : null);
const projectId = resource => id(projectOf(resource)?._id || resource.board || resource.projectId);
const departmentId = resource => id(projectOf(resource)?.department || resource.department || resource._id);
const directProjectMember = (ctx, project) => id(project?.owner) === id(ctx.userId) || includes(project?.members, ctx.userId);
const publicAdminProject = (ctx, project) => project.visibility === 'public' && (ctx.isOwner || ctx.role?.key === 'admin');
const explicitPrivateAccess = (ctx, project) => project?.visibility === 'private' && (
  includes(project.managers, ctx.userId) || includes(ctx.allowedProjectIds, project._id) ||
  ctx.restriction?.type === 'selected_projects' && includes(ctx.restriction.projectIds, project._id)
);

function scopeMatches(ctx, record, resource, permission) {
  const { scope, scopeIds } = record;
  const restrictedIds = scopeIds?.length > 0;
  if (!resource) return scope === 'workspace' || !restrictedIds;
  if (scope === 'workspace') return true;
  if (scope === 'own') {
    const owner = resource.visibility ? resource.owner : resource.createdBy || resource.uploadedBy || resource.user || resource.owner;
    return id(owner) === id(ctx.userId) || (resource.visibility && permission !== 'project.change_visibility' && includes(resource.managers, ctx.userId));
  }
  if (scope === 'assigned') return resource.visibility ? directProjectMember(ctx, resource) ||
    includes(resource.managers, ctx.userId) || includes(ctx.assignedProjectIds, resource._id) : assigned(ctx, resource.taskResource || resource);
  if (scope === 'project') return Boolean(projectId(resource)) && (!restrictedIds || includes(scopeIds, projectId(resource)));
  if (scope === 'department') {
    if (restrictedIds && !includes(scopeIds, departmentId(resource)) && !(resource.departments || []).some(d => includes(scopeIds, d))) return false;
    if (CATALOG[permission].scopeBasis === 'management') return includes(ctx.managedDepartments, departmentId(resource)) || (resource.departments || []).some(d => includes(ctx.managedDepartments, d) && (!restrictedIds || includes(scopeIds, d)));
    return includes([...(ctx.departments || []), ...(ctx.managedDepartments || [])], departmentId(resource)) || (!restrictedIds && Boolean(projectId(resource)) && includes(ctx.memberProjectIds, projectId(resource)));
  }
  return false;
}

export function canViewProject(ctx, project, { includeDeleted = false } = {}) {
  const now = ctx?.now ?? Date.now();
  if (!ctx || ctx.status !== 'active' || !project || id(project.workspaceId) !== id(ctx.workspaceId) || ctx.kind === 'guest' && !current({ expiresAt: ctx.guestExpiresAt }, now)) return false;
  if (project.isDeleted && !includeDeleted) return false;
  if (assignedWorkOnly(ctx)) return includes(ctx.assignedProjectIds, project._id);
  const directMember = ctx.kind !== 'guest' && directProjectMember(ctx, project);
  const member = directMember || includes(project.managers, ctx.userId);
  let visible;
  if (ctx.kind === 'guest') visible = project.visibility === 'private' && (project.guests || []).some(g => id(g.user) === id(ctx.userId) && current(g, now));
  else if (member) visible = true;
  else if (project.visibility === 'private') visible = explicitPrivateAccess(ctx, project) || includes(ctx.assignedProjectIds, project._id);
  else if (project.visibility === 'workspace') visible = true;
  else if (publicAdminProject(ctx, project)) visible = true;
  else if (project.visibility === 'department') visible = includes([...(ctx.departments || []), ...(ctx.managedDepartments || [])], project.department) || records(mapGet(ctx.grants, 'project.view')).some(g => g.scope === 'workspace' && current(g, now));
  else visible = false;
  if (!visible) return false;
  if (ctx.restriction?.type === 'selected_projects') return includes(ctx.restriction.projectIds, project._id);
  if (ctx.restriction?.type === 'assigned_only') return directMember ||
    (ctx.kind !== 'guest' && explicitPrivateAccess(ctx, project)) || includes(ctx.assignedProjectIds, project._id);
  return true;
}

export function explain(ctx, permission, resource) {
  const entry = CATALOG[permission];
  const result = { allowed: false, reason: '', sources: [], deniedBy: [], checks: [] };
  const stop = reason => ({ ...result, reason, checks: [...result.checks, { check: reason, passed: false }] });
  if (!entry) return stop('unknown_permission');
  if (!ctx || ctx.status !== 'active') return stop('no_membership');
  const now = ctx.now ?? Date.now();
  if (ctx.kind === 'guest' && !current({ expiresAt: ctx.guestExpiresAt }, now)) return stop('guest_expired');
  if (resource && id(resource.workspaceId || projectOf(resource)?.workspaceId) !== id(ctx.workspaceId)) return stop('wrong_workspace');
  if (entry.ownerOnly) return ctx.isOwner ? { ...result, allowed: true, reason: 'owner', sources: ['owner'] } : stop('owner_only');
  if (ctx.kind === 'guest' && !entry.guestAllowed) return stop('guest_not_allowed');
  const project = projectOf(resource);
  const directory = ['project.view_private_directory', 'project.join_private'].includes(permission);
  if (resource && assignedWorkOnly(ctx) && ['task', 'comment', 'attachment'].includes(entry.resourceType) && !resource.visibility &&
      !(resource.resourceType === 'list' && permission === 'task.view') && !assignedWorkTask(ctx, resource.taskResource || resource)) return stop('restricted');
  if (resource && ['project', 'task', 'comment', 'attachment'].includes(entry.resourceType) && !directory) {
    if (!project || !canViewProject(ctx, project, { includeDeleted: permission === 'project.restore' || permission === 'project.purge' })) return stop('not_visible');
  }
  const denies = ctx.isOwner ? [] : records(mapGet(ctx.denies, permission)).filter(d => current(d, now) && (resource ? scopeMatches(ctx, d, resource, permission) : d.scope === 'workspace'));
  if (denies.length) { result.deniedBy = denies.map(d => d.overrideId); return stop('override_deny'); }
  const grants = ctx.isOwner ? [{ scope: 'workspace', sources: ['owner'] }] : records(mapGet(ctx.grants, permission)).filter(g => current(g, now));
  if (!grants.length) return stop('no_grant');
  if (ctx.kind === 'guest' && !grants.some(g => g.scope === 'project')) return stop('guest_scope_cap');
  for (const dependency of entry.dependsOn) if (!can(ctx, dependency, resource)) return stop('missing_dependency');
  const matching = grants.filter(g => (ctx.kind !== 'guest' || g.scope === 'project') && (!resource || scopeMatches(ctx, g, resource, permission)));
  if (!matching.length) return stop('out_of_scope');
  if (resource && !assignedWorkOnly(ctx) && ctx.restriction?.type === 'assigned_only' && ['task', 'comment', 'attachment'].includes(entry.resourceType) && !resource.visibility &&
      !(permission === 'task.view' && ctx.kind !== 'guest' && (directProjectMember(ctx, project) || explicitPrivateAccess(ctx, project))) &&
      !assigned(ctx, resource.taskResource || resource)) return stop('restricted');
  if (ctx.kind === 'guest' && resource) {
    const share = project?.guests?.find(g => id(g.user) === id(ctx.userId) && current(g, now));
    const level = { viewer: ['project.view', 'task.view'], commenter: ['project.view', 'task.view', 'comment.create'], editor: ['project.view', 'task.view', 'comment.create', 'task.create', 'task.update', 'task.move', 'attachment.upload'] };
    if (!level[share?.access]?.includes(permission)) return stop('guest_level');
  }
  result.sources = [...new Set(matching.flatMap(g => g.sources || []))];
  return { ...result, allowed: true, reason: ctx.isOwner ? 'owner' : 'allowed', checks: [...result.checks, { check: 'allowed', passed: true }] };
}
export const can = (ctx, permission, resource) => explain(ctx, permission, resource).allowed;

// Calendar deadlines have an explicit workspace/department read scope. Keep
// normal project visibility unchanged, and retain restrictions and deny rules.
function calendarProjectAccess(ctx, project) {
  if (!ctx || ctx.status !== 'active' || ctx.kind === 'guest' || project.isDeleted || id(project.workspaceId) !== id(ctx.workspaceId)) return false;
  const role = ctx.role?.key;
  if (role !== 'admin' && !(role === 'manager' && includes([...(ctx.departments || []), ...(ctx.managedDepartments || [])], project.department)) && !includes(ctx.assignedProjectIds,project._id)) return false;
  if (ctx.restriction?.type === 'selected_projects' && !includes(ctx.restriction.projectIds, project._id)) return false;
  if (ctx.restriction?.type === 'assigned_only' && !directProjectMember(ctx, project) && !explicitPrivateAccess(ctx, project) && !includes(ctx.assignedProjectIds, project._id)) return false;
  return true;
}

// A query filter is intentionally explicit and tenant-bound. Each visibility
// expression corresponds to canViewProject; child filters use project IDs.
export function projectVisibilityFilter(ctx, {calendarScope=false}={}) {
  if (!ctx || ctx.status !== 'active' || ctx.kind === 'guest' && !current({ expiresAt: ctx.guestExpiresAt }, ctx.now ?? Date.now())) return { _id: { $in: [] }, workspaceId: ctx?.workspaceId };
  const now = new Date(ctx.now ?? Date.now());
  if (assignedWorkOnly(ctx)) return { workspaceId: ctx.workspaceId, isDeleted: { $ne: true }, _id: { $in: ctx.assignedProjectIds || [] } };
  let alternatives;
  if (ctx.kind === 'guest') alternatives = [{ visibility: 'private', guests: { $elemMatch: { user: ctx.userId, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] } } }];
  else alternatives = [{ owner: ctx.userId }, { members: ctx.userId }, { managers: ctx.userId }, { visibility: 'workspace' }, { visibility: 'department', ...(records(mapGet(ctx.grants, 'project.view')).some(g => g.scope === 'workspace' && current(g, now.getTime())) || ctx.isOwner ? {} : { department: { $in: [...(ctx.departments || []), ...(ctx.managedDepartments || [])] } }) }];
  if (ctx.kind !== 'guest' && (ctx.isOwner || ctx.role?.key === 'admin')) alternatives.push({ visibility: 'public' });
  const explicitPrivate = { visibility: 'private', $or: [{ managers: ctx.userId }, { _id: { $in: [
    ...(ctx.allowedProjectIds || []), ...(ctx.restriction?.type === 'selected_projects' ? ctx.restriction.projectIds || [] : [])
  ] } }] };
  if (ctx.kind !== 'guest') alternatives.push(explicitPrivate, { visibility: 'private', _id: { $in: ctx.assignedProjectIds || [] } });
  if (calendarScope && ctx.kind !== 'guest') {
    alternatives.push({_id:{$in:ctx.assignedProjectIds || []}});
    if (ctx.role?.key === 'admin') alternatives.push({});
    else if (ctx.role?.key === 'manager') alternatives.push({department:{$in:[...(ctx.departments || []), ...(ctx.managedDepartments || [])]}});
  }
  const conditions = [{ workspaceId: ctx.workspaceId, isDeleted: { $ne: true }, $or: alternatives }];
  if (ctx.restriction?.type === 'selected_projects') conditions.push({ _id: { $in: ctx.restriction.projectIds } });
  if (ctx.restriction?.type === 'assigned_only') conditions.push({ $or: [
    { _id: { $in: ctx.assignedProjectIds || [] } },
    ...(ctx.kind === 'guest' ? [] : [{ owner: ctx.userId }, { members: ctx.userId }, explicitPrivate])
  ] });
  return { $and: conditions };
}

// Match the project.view grant and deny scopes as well as visibility. A
// workspace-visible project alone does not confer a project-scoped grant.
export function projectAccessFilter(ctx, options) {
  if (!can(ctx, 'project.view')) return { _id: { $in: [] }, workspaceId: ctx?.workspaceId };
  const relation = record => {
    const ids = record.scopeIds || [];
    if (record.scope === 'workspace') return {};
    if (record.scope === 'own') return { $or: [{ owner: ctx.userId }, { managers: ctx.userId }] };
    if (record.scope === 'assigned') return { $or: [{ owner: ctx.userId }, { members: ctx.userId }, { managers: ctx.userId }, { _id: { $in: ctx.assignedProjectIds || [] } }] };
    if (record.scope === 'project') return ids.length ? { _id: { $in: ids } } : {};
    if (record.scope === 'department') {
      const departments = [...(ctx.departments || []), ...(ctx.managedDepartments || [])];
      return ids.length ? { department: { $in: departments.filter(value => includes(ids, value)) } } : { $or: [{ department: { $in: departments } }, { _id: { $in: ctx.memberProjectIds || [] } }] };
    }
    return { _id: { $in: [] } };
  };
  const grants = ctx.isOwner ? [{ scope: 'workspace' }] : records(mapGet(ctx.grants, 'project.view')).filter(g => current(g, ctx.now ?? Date.now()));
  const conditions = [projectVisibilityFilter(ctx, options), { $or: grants.map(relation) }];
  if (!ctx.isOwner) for (const deny of records(mapGet(ctx.denies, 'project.view')).filter(d => current(d, ctx.now ?? Date.now()))) conditions.push({ $nor: [relation(deny)] });
  return { $and: conditions };
}

export function scopeFilter(ctx, permission, resourceType, visibleProjects = [], {calendarScope=false}={}) {
  if (!can(ctx, permission)) return { workspaceId: ctx?.workspaceId, _id: { $in: [] } };
  if (resourceType === 'project') {
    // Callers supply visible project fixtures/IDs evaluated with the same
    // engine after the indexed visibility query; query permission narrows it.
    return { workspaceId: ctx.workspaceId, _id: { $in: visibleProjects.filter(p => can(ctx, permission, p)).map(p => p._id) } };
  }
  const projects = visibleProjects.filter(p => canViewProject(ctx, p) || calendarScope && calendarProjectAccess(ctx, p));
  const ownerField = ({ comment: 'user', attachment: 'uploadedBy', task: 'createdBy', member: 'user', department: 'owner', team: 'owner' })[resourceType] || 'createdBy';
  const assignment = () => resourceType === 'comment' ? { card: { $in: ctx.assignedTaskIds || [] } }
    : resourceType === 'attachment' ? { $or: [{ card: { $in: ctx.assignedTaskIds || [] } }, { subtask: { $in: ctx.assignedSubtaskIds || [] } }, { nanoSubtask: { $in: ctx.assignedNanoIds || [] } }, { comment: { $in: ctx.assignedCommentIds || [] } }, { contextRef: { $in: [...(ctx.assignedTaskIds || []), ...(ctx.assignedSubtaskIds || []), ...(ctx.assignedNanoIds || []), ...(ctx.assignedCommentIds || [])] } }] }
    : { $or: [{ assignees: ctx.userId }, { members: ctx.userId }, { [resourceType === 'task' ? '_id' : 'task']: { $in: ctx.assignedTaskIds || [] } }] };
  const relation = record => {
    let eligible = projects;
    if (record.scopeIds?.length) eligible = eligible.filter(p => includes(record.scopeIds, record.scope === 'department' ? p.department : p._id));
    if (record.scope === 'department') eligible = eligible.filter(p => includes(CATALOG[permission].scopeBasis === 'management' ? ctx.managedDepartments : [...(ctx.departments || []), ...(ctx.managedDepartments || [])], p.department) || (!record.scopeIds?.length && includes(ctx.memberProjectIds, p._id)));
    const parent = { board: { $in: eligible.map(p => p._id) } };
    if (record.scope === 'own') return { $and: [parent, { [ownerField]: ctx.userId }] };
    if (record.scope === 'assigned') return { $and: [parent, assignment()] };
    return parent;
  };
  const grants = ctx.isOwner ? [{ scope: 'workspace' }] : records(mapGet(ctx.grants, permission)).filter(g => current(g, ctx.now ?? Date.now()));
  // Manager templates can derive a department-wide task.view grant from other
  // permissions. Calendar also includes their own cross-department assignments.
  // Keep this read-only addition local; explicit denies below still win.
  const readGrants = calendarScope && resourceType==='task' && permission==='task.view' && ctx.role?.key==='manager'
    ? [...grants,{scope:'assigned'}] : grants;
  const filters = [{ workspaceId: ctx.workspaceId }, { $or: readGrants.map(relation) }];
  if (!ctx.isOwner) for (const deny of records(mapGet(ctx.denies, permission)).filter(d => current(d, ctx.now ?? Date.now()))) filters.push({ $nor: [relation(deny)] });
  if (assignedWorkOnly(ctx)) {
    const root = { $in: ctx.assignedTaskIds || [] };
    filters.push(resourceType === 'task' ? { $or: [{ assignees: ctx.userId }, { _id: root }] } : assignment());
  } else if (ctx.restriction?.type === 'assigned_only') {
    const memberBoards = permission === 'task.view' && ctx.kind !== 'guest'
      ? projects.filter(project => directProjectMember(ctx, project) || explicitPrivateAccess(ctx, project)).map(project => project._id) : [];
    filters.push(memberBoards.length ? { $or: [assignment(), { board: { $in: memberBoards } }] } : assignment());
  }
  return { $and: filters };
}
