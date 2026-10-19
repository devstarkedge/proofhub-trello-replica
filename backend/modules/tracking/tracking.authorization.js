import Role from '../../models/Role.js';
import Board from '../../models/Board.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import { buildContext } from '../../authz/context.js';
import { can as engineCan, id, projectVisibilityFilter as engineFilter } from '../../authz/engine.js';
import { loadAssignments } from '../../authz/loaders.js';
import { resolveResourceAccess } from '../permissions/permissionEngine.js';

// Respect the application's rollout mode. The existing Board access helper is
// the authority for legacy visibility; V2 remains the authority in enforce
// mode. Both paths use active WorkspaceMembership, never global User.role.
export async function trackingContext(workspaceId,userId,{includeProjects=true,projectRecords=null}={}) {
  const ctx=await buildContext(userId,workspaceId,{allowLegacy:process.env.AUTHZ_V2!=='enforce'});
  if(includeProjects)await loadAssignments(ctx);
  if(process.env.AUTHZ_V2==='enforce'||ctx.status!=='active'||ctx.kind==='guest')return ctx;
  const membership=await WorkspaceMembership.findOne({workspace:workspaceId,user:userId,status:'active'}).lean();
  if(!membership)return ctx;
  const principal={...membership,_id:userId,id:userId,workspaceId};
  ctx.trackingPrincipal=principal;
  const role=membership.roleId?await Role.findById(membership.roleId).lean():await Role.findResolvable(membership.role,workspaceId).lean();
  const permissions=role?.isSystem?Role.getDefaultPermissions(role.slug):role?.permissions||{};
  if(!role?.grants){
    const grant=(permission,scope)=>{(ctx.grants[permission]||=[]).push({scope,sources:['legacy:workspace-membership']});};
    for(const permission of ['project.view','task.view','time.log'])grant(permission,'project');
    if(permissions.canCreateTask)grant('task.create','project');
    if(permissions.canAssignMembers)grant('task.assign','project');
  }
  const resource=await resolveResourceAccess(principal,'tracking',workspaceId);
  // Explicit legacy resource denies override all tracking grants, including
  // structural report access. Fine-grained V2 denies are still evaluated.
  if(resource.source==='deny-override') { ctx.trackingDenied=true; for(const action of ['log','view_reports','view_screenshots','manage_policy'])ctx.denies[`tracking.${action}`]=[{scope:'workspace',sources:['legacy:deny']}]; }
  else for(const [action,allowed]of Object.entries(resource.actions||{}))if(allowed){
    const scope=action==='log'?'own':resource.scope==='department'?'department':'workspace';
    (ctx.grants[`tracking.${action}`]||=[]).push({scope,
      ...(resource.scopedResourceIds?.length?{scopeIds:resource.scopedResourceIds}:{}),sources:[`legacy:${resource.source}`]});
  }
  if(!includeProjects)return ctx;
  return withTrackingProjects(ctx,projectRecords || await Board.find({workspaceId,isDeleted:{$ne:true}}).lean());
}
// Resolve only the candidate page using the already authenticated request
// context. This avoids rebuilding membership, role and override state twice.
export async function withTrackingProjects(ctx,projects){
  await loadAssignments(ctx);
  if(process.env.AUTHZ_V2==='enforce'||ctx.status!=='active'||ctx.kind==='guest')return ctx;
  const principal=ctx.trackingPrincipal,workspaceId=ctx.workspaceId,userId=ctx.userId;
  if(!principal)return ctx;
  const membership=principal;
  const {canUserAccessBoard}=await import('../../controllers/boardController.js');
  projects=projects.filter(p=>id(p.workspaceId)===id(workspaceId));
  ctx.trackingProjectRecords=projects;
  const visible=[];
  for(const project of projects){
    // Preserve the existing selected-project restriction even where the
    // legacy helper returns early for owner/member/public visibility.
    if(membership.accessType==='selected_projects'&&membership.role!=='admin'&&!(membership.allowedProjects||[]).some(p=>id(p)===id(project._id)))continue;
    if(await canUserAccessBoard(project,principal))visible.push(id(project._id));
  }
  ctx.trackingLegacyProjectIds=visible;
  ctx.trackingOriginalRestriction=ctx.restriction;
  ctx.restriction={type:'none',projectIds:[]}; // already enforced by the existing visibility helper above
  return ctx;
}
export function can(ctx,permission,resource) {
  if(ctx.trackingDenied && permission.startsWith('tracking.'))return false;
  if(!ctx.trackingLegacyProjectIds||!resource)return engineCan(ctx,permission,resource);
  const project=resource.project||(resource.visibility?resource:null);
  if(!project)return engineCan(ctx,permission,resource);
  if(!ctx.trackingLegacyProjectIds.includes(id(project._id)))return false;
  const normalized={...project,visibility:'workspace'};
  return engineCan(ctx,permission,resource.visibility?normalized:{...resource,project:normalized});
}
export function projectVisibilityFilter(ctx) {
  return ctx.trackingLegacyProjectIds?{workspaceId:ctx.workspaceId,_id:{$in:ctx.trackingLegacyProjectIds}}:engineFilter(ctx);
}
