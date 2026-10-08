import { CATALOG } from './catalog.js';

export const id = value => String(value?._id || value || '');
const includes = (values, value) => (values || []).some(item => id(item) === id(value));
const current = (record, now) => !record.expiresAt || new Date(record.expiresAt).getTime() > now;
const records = value => !value ? [] : Array.isArray(value) ? value : [value];
const mapGet = (map, key) => map instanceof Map ? map.get(key) : map?.[key];
const assigned = (ctx, resource) => includes(resource.assignees, ctx.userId) || includes(resource.members, ctx.userId) || includes(ctx.assignedTaskIds, resource._id) || includes(ctx.assignedTaskIds, resource.task?._id || resource.task || resource.card?._id || resource.card);
const projectOf = resource => resource?.project || (resource?.board && typeof resource.board === 'object' && resource.board.visibility ? resource.board : null) || (resource?.visibility ? resource : null);
const projectId = resource => id(projectOf(resource)?._id || resource.board || resource.projectId);
const departmentId = resource => id(projectOf(resource)?.department || resource.department || resource._id);

function scopeMatches(ctx, record, resource, permission) {
  const { scope, scopeIds } = record;
  const restrictedIds = scopeIds?.length > 0;
  if (!resource) return scope === 'workspace' || !restrictedIds;
  if (scope === 'workspace') return true;
  if (scope === 'own') {
    const owner = resource.visibility ? resource.owner : resource.createdBy || resource.uploadedBy || resource.user || resource.owner;
    return id(owner) === id(ctx.userId) || (resource.visibility && permission !== 'project.change_visibility' && includes(resource.managers, ctx.userId));
  }
  if (scope === 'assigned') return assigned(ctx, resource.taskResource || resource);
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
  const member = id(project.owner) === id(ctx.userId) || includes(project.members, ctx.userId) || includes(project.managers, ctx.userId);
  let visible;
  if (ctx.kind === 'guest') visible = project.visibility === 'private' && (project.guests || []).some(g => id(g.user) === id(ctx.userId) && current(g, now));
  else if (member) visible = true;
  else if (project.visibility === 'private') visible = false;
  else if (project.visibility === 'workspace') visible = true;
  else if (project.visibility === 'department') visible = includes([...(ctx.departments || []), ...(ctx.managedDepartments || [])], project.department) || records(mapGet(ctx.grants, 'project.view')).some(g => g.scope === 'workspace' && current(g, now));
  else visible = false; // Legacy public must be migrated explicitly first.
  if (!visible) return false;
  if (ctx.restriction?.type === 'selected_projects') return includes(ctx.restriction.projectIds, project._id);
  if (ctx.restriction?.type === 'assigned_only') return includes(ctx.assignedProjectIds, project._id);
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
  if (resource && ctx.restriction?.type === 'assigned_only' && ['task', 'comment', 'attachment'].includes(entry.resourceType) && !resource.visibility && !assigned(ctx, resource.taskResource || resource)) return stop('restricted');
  if (ctx.kind === 'guest' && resource) {
    const share = project?.guests?.find(g => id(g.user) === id(ctx.userId) && current(g, now));
    const level = { viewer: ['project.view', 'task.view'], commenter: ['project.view', 'task.view', 'comment.create'], editor: ['project.view', 'task.view', 'comment.create', 'task.create', 'task.update', 'task.move', 'attachment.upload'] };
    if (!level[share?.access]?.includes(permission)) return stop('guest_level');
  }
  result.sources = [...new Set(matching.flatMap(g => g.sources || []))];
  return { ...result, allowed: true, reason: ctx.isOwner ? 'owner' : 'allowed', checks: [...result.checks, { check: 'allowed', passed: true }] };
}
export const can = (ctx, permission, resource) => explain(ctx, permission, resource).allowed;

// A query filter is intentionally explicit and tenant-bound. Each visibility
// expression corresponds to canViewProject; child filters use project IDs.
export function projectVisibilityFilter(ctx) {
  if (!ctx || ctx.status !== 'active' || ctx.kind === 'guest' && !current({ expiresAt: ctx.guestExpiresAt }, ctx.now ?? Date.now())) return { _id: { $in: [] }, workspaceId: ctx?.workspaceId };
  const now = new Date(ctx.now ?? Date.now());
  let alternatives;
  if (ctx.kind === 'guest') alternatives = [{ visibility: 'private', guests: { $elemMatch: { user: ctx.userId, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] } } }];
  else alternatives = [{ owner: ctx.userId }, { members: ctx.userId }, { managers: ctx.userId }, { visibility: 'workspace' }, { visibility: 'department', ...(records(mapGet(ctx.grants, 'project.view')).some(g => g.scope === 'workspace' && current(g, now.getTime())) || ctx.isOwner ? {} : { department: { $in: [...(ctx.departments || []), ...(ctx.managedDepartments || [])] } }) }];
  const conditions = [{ workspaceId: ctx.workspaceId, isDeleted: { $ne: true }, $or: alternatives }];
  if (ctx.restriction?.type === 'selected_projects') conditions.push({ _id: { $in: ctx.restriction.projectIds } });
  if (ctx.restriction?.type === 'assigned_only') conditions.push({ _id: { $in: ctx.assignedProjectIds || [] } });
  return { $and: conditions };
}

export function scopeFilter(ctx, permission, resourceType, visibleProjects = []) {
  if (!can(ctx, permission)) return { workspaceId: ctx?.workspaceId, _id: { $in: [] } };
  if (resourceType === 'project') {
    // Callers supply visible project fixtures/IDs evaluated with the same
    // engine after the indexed visibility query; query permission narrows it.
    return { workspaceId: ctx.workspaceId, _id: { $in: visibleProjects.filter(p => can(ctx, permission, p)).map(p => p._id) } };
  }
  const projects = visibleProjects.filter(p => canViewProject(ctx, p));
  const ownerField = ({ comment: 'user', attachment: 'uploadedBy', task: 'createdBy', member: 'user', department: 'owner', team: 'owner' })[resourceType] || 'createdBy';
  const relation = record => {
    let eligible = projects;
    if (record.scopeIds?.length) eligible = eligible.filter(p => includes(record.scopeIds, record.scope === 'department' ? p.department : p._id));
    if (record.scope === 'department') eligible = eligible.filter(p => includes(CATALOG[permission].scopeBasis === 'management' ? ctx.managedDepartments : [...(ctx.departments || []), ...(ctx.managedDepartments || [])], p.department) || (!record.scopeIds?.length && includes(ctx.memberProjectIds, p._id)));
    const parent = { board: { $in: eligible.map(p => p._id) } };
    if (record.scope === 'own') return { $and: [parent, { [ownerField]: ctx.userId }] };
    if (record.scope === 'assigned') return { $and: [parent, { $or: [{ assignees: ctx.userId }, { members: ctx.userId }, { _id: { $in: ctx.assignedTaskIds || [] } }] }] };
    return parent;
  };
  const grants = ctx.isOwner ? [{ scope: 'workspace' }] : records(mapGet(ctx.grants, permission)).filter(g => current(g, ctx.now ?? Date.now()));
  const filters = [{ workspaceId: ctx.workspaceId }, { $or: grants.map(relation) }];
  if (!ctx.isOwner) for (const deny of records(mapGet(ctx.denies, permission)).filter(d => current(d, ctx.now ?? Date.now()))) filters.push({ $nor: [relation(deny)] });
  if (ctx.restriction?.type === 'assigned_only') filters.push({ $or: [{ assignees: ctx.userId }, { members: ctx.userId }, { _id: { $in: ctx.assignedTaskIds || [] } }] });
  return { $and: filters };
}
