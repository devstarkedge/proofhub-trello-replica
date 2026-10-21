import WorkspaceMembership from '../models/WorkspaceMembership.js';
import Workspace from '../models/Workspace.js';
import Role from '../models/Role.js';
import Department from '../models/Department.js';
import PermissionOverride from '../models/PermissionOverride.js';
import { CATALOG } from './catalog.js';
import { TEMPLATES, STRUCTURAL_PERMISSIONS } from './templates.js';
import { run } from '../modules/workspaces/workspaceContext.js';
import { id } from './engine.js';
import mongoose from 'mongoose';

// Dependencies are injectable for fixture tests; no authorization comes from
// identity mirrors or JWT role claims. Legacy slugs are a shadow-only adapter.
export function contextFromRecords({ userId, workspace, membership, role, departments = [], overrides = [], now = Date.now(), allowLegacy = false }) {
  const isOwner = id(workspace?.owner) === id(userId);
  const ctx = { userId: id(userId), workspaceId: id(workspace?._id), kind: membership?.kind || 'member', status: workspace?.isActive && workspace.status !== 'suspended' && workspace.status !== 'archived' ? membership?.status : 'inactive', isOwner, role: role ? { id: id(role._id), key: role.key || role.slug, name: role.name, kind: role.kind || 'member', locked: role.locked === true, isActive: role.isActive } : null, departments: (membership?.departments || membership?.department || []).map(id), managedDepartments: departments.filter(d => (d.managers || []).some(u => id(u) === id(userId))).map(d => id(d._id)), restriction: membership?.restriction || { type: membership?.accessType === 'selected_projects' ? 'selected_projects' : membership?.accessType === 'assigned_tasks' ? 'assigned_only' : 'none', projectIds: (membership?.allowedProjects || []).map(id) }, guestExpiresAt: membership?.guest?.expiresAt, grants: {}, denies: {}, versions: { perm: membership?.permVersion || 0, roles: workspace?.authzVersion || 0 } };
  const add = (permission, record) => { if (CATALOG[permission]) (ctx.grants[permission] ||= []).push(record); };
  let roleGrants = role?.grants;
  if (!roleGrants && allowLegacy && role?.isSystem) roleGrants = TEMPLATES[role.slug]?.grants;
  if (role?.isActive && (!role.workspaceId || id(role.workspaceId) === ctx.workspaceId) && (allowLegacy || role.workspaceId)) for (const grant of roleGrants || []) add(grant.permission, { ...grant, sources: [`role:${role.key || role.slug}`] });
  if (ctx.managedDepartments.length && ctx.kind !== 'guest') for (const permission of STRUCTURAL_PERMISSIONS) add(permission, { scope: 'department', scopeIds: ctx.managedDepartments, sources: ['structural:department_manager'] });
  for (const override of overrides) {
    if (id(override.workspace) !== ctx.workspaceId || id(override.user) !== ctx.userId || override.status !== 'active' || override.expiresAt && new Date(override.expiresAt).getTime() <= now) continue;
    const record = { scope: override.scope, scopeIds: override.scopeIds?.map(id), expiresAt: override.expiresAt, overrideId: id(override._id), sources: [`override:${id(override._id)}`] };
    if (override.effect === 'deny') (ctx.denies[override.permission] ||= []).push(record);
    else add(override.permission, record);
  }
  if (isOwner) {
    ctx.grants = Object.fromEntries(Object.entries(CATALOG).filter(([, p]) => !p.ownerOnly).map(([permission]) => [permission, [{ scope: 'workspace', sources: ['owner'] }]]));
    ctx.denies = {}; ctx.restriction = { type: 'none', projectIds: [] };
  }
  if (allowLegacy && role?.isSystem && TEMPLATES[role.slug]?.locked) ctx.role.locked = true;
  return ctx;
}

export async function buildContext(userId, workspaceId, { allowLegacy = false, includeRecords = false, batchReads = false } = {}) {
  if (!workspaceId || !userId) return { status: 'inactive', grants: {}, denies: {} };
  return run({ workspaceId }, async () => {
    let workspace, membership, departments, overrides, role;
    if(batchReads){
      // One server round trip, using the same canonical evaluator below.
      // Explicit tenant predicates apply to every joined collection.
      const tenant=new mongoose.Types.ObjectId(id(workspaceId)),actor=new mongoose.Types.ObjectId(id(userId));
      const [record]=await Workspace.aggregate([
        {$match:{_id:tenant}},{$limit:1},
        {$lookup:{from:WorkspaceMembership.collection.name,pipeline:[{$match:{workspace:tenant,user:actor}},{$limit:1}],as:'_ctxMembership'}},
        {$set:{_ctxMembership:{$first:'$_ctxMembership'}}},
        {$lookup:{from:Role.collection.name,let:{role:'$_ctxMembership.roleId'},pipeline:[{$match:{...(allowLegacy?{$or:[{workspaceId:tenant},{workspaceId:null,isSystem:true}]}:{workspaceId:tenant}),$expr:{$eq:['$_id','$$role']}}}],as:'_ctxRole'}},
        {$lookup:{from:Department.collection.name,pipeline:[{$match:{workspaceId:tenant,managers:actor,isActive:{$ne:false}}},{$project:{_id:1,managers:1}}],as:'_ctxDepartments'}},
        {$lookup:{from:PermissionOverride.collection.name,pipeline:[{$match:{workspace:tenant,user:actor,status:'active'}}],as:'_ctxOverrides'}}
      ]).option({maxTimeMS:10000});
      if(record){const {_ctxMembership,_ctxRole,_ctxDepartments,_ctxOverrides,...storedWorkspace}=record;workspace=storedWorkspace;membership=_ctxMembership;role=_ctxRole?.[0]||null;departments=_ctxDepartments;overrides=_ctxOverrides;}
      else {workspace=null;membership=null;role=null;departments=[];overrides=[];}
    }else{
    [workspace, membership, departments, overrides] = await Promise.all([
      Workspace.findById(workspaceId).lean(),
      WorkspaceMembership.findOne({ workspace: workspaceId, user: userId }).lean(),
      Department.find({ workspaceId, managers: userId, isActive: { $ne: false } }).select('_id managers').lean(),
      PermissionOverride.find({ workspace: workspaceId, user: userId, status: 'active' }).lean()
    ]);
    role = membership?.roleId ? await Role.findOne({ _id: membership.roleId, ...(allowLegacy ? {} : { workspaceId }) }).lean() : null;
    }
    const ctx = contextFromRecords({ userId, workspace, membership, role, departments, overrides, allowLegacy });
    // Request-local reuse only. These records never enter serialized contexts.
    if (includeRecords) Object.defineProperty(ctx, 'resolvedRecords', { value: {workspace,membership,role,departments} });
    return ctx;
  });
}
