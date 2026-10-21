import Role from '../../models/Role.js';
import Board from '../../models/Board.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import { buildContext } from '../../authz/context.js';
import { can as engineCan, id, projectVisibilityFilter as engineFilter } from '../../authz/engine.js';
import { loadAssignments } from '../../authz/loaders.js';
import { resolveResourceAccess } from '../permissions/permissionEngine.js';
import Department from '../../models/Department.js';
import Card from '../../models/Card.js';
import {getAssignmentBasedBoardIds} from '../../services/permissionService.js';
export const trackingProjectFields='_id workspaceId name visibility owner members managers guests department team isDeleted';

// Respect the application's rollout mode. The existing Board access helper is
// the authority for legacy visibility; V2 remains the authority in enforce
// mode. Both paths use active WorkspaceMembership, never global User.role.
export async function trackingContext(workspaceId,userId,{includeProjects=true,projectRecords=null,readOnly=false}={}) {
  const [ctx,members,projects]=await Promise.all([
    buildContext(userId,workspaceId,{allowLegacy:process.env.AUTHZ_V2!=='enforce',includeRecords:true,batchReads:readOnly}),
    readOnly?WorkspaceMembership.find({workspace:workspaceId,status:'active',kind:{$ne:'guest'}}).lean():null,
    readOnly&&includeProjects?Board.find({workspaceId,isDeleted:{$ne:true}}).select(trackingProjectFields).lean():null
  ]);
  if(members)ctx.trackingMembers=members;
  if(projects)ctx.trackingProjectRecords=projects;
  const readPermissions=['project.view','tracking.view_reports','tracking.view_screenshots'];
  const assignmentsRequired=!readOnly||ctx.restriction?.type==='assigned_only'||readPermissions.some(permission=>[...(ctx.grants[permission]||[]),...(ctx.denies[permission]||[])].some(record=>record.scope==='assigned'));
  if(includeProjects&&assignmentsRequired)await loadAssignments(ctx);
  if(process.env.AUTHZ_V2==='enforce'||ctx.status!=='active'||ctx.kind==='guest')return ctx;
  const membership=ctx.resolvedRecords.membership;
  if(!membership)return ctx;
  const principal={...membership,_id:userId,id:userId,workspaceId};
  ctx.trackingPrincipal=principal;
  const role=ctx.resolvedRecords.role||(membership.roleId?await Role.findById(membership.roleId).lean():await Role.findResolvable(membership.role,workspaceId).lean());
  const permissions=role?.isSystem?Role.getDefaultPermissions(role.slug):role?.permissions||{};
  if(!role?.grants){
    const grant=(permission,scope)=>{(ctx.grants[permission]||=[]).push({scope,sources:['legacy:workspace-membership']});};
    for(const permission of ['project.view','task.view','time.log'])grant(permission,'project');
    if(permissions.canCreateTask)grant('task.create','project');
    if(permissions.canAssignMembers)grant('task.assign','project');
  }
  const [resource,readRoles]=await Promise.all([
    resolveResourceAccess(principal,'tracking',workspaceId),
    readOnly?Role.find({$or:[{_id:{$in:members.map(member=>member.roleId).filter(Boolean)}},{slug:{$in:members.filter(member=>!member.roleId).map(member=>member.role)}}]}).lean():null
  ]);
  if(readRoles)ctx.trackingReadRoles=readRoles;
  // Explicit legacy resource denies override all tracking grants, including
  // structural report access. Fine-grained V2 denies are still evaluated.
  if(resource.source==='deny-override') { ctx.trackingDenied=true; for(const action of ['log','view_reports','view_screenshots','manage_policy'])ctx.denies[`tracking.${action}`]=[{scope:'workspace',sources:['legacy:deny']}]; }
  else for(const [action,allowed]of Object.entries(resource.actions||{}))if(allowed){
    const scope=action==='log'?'own':resource.scope==='department'?'department':'workspace';
    (ctx.grants[`tracking.${action}`]||=[]).push({scope,
      ...(resource.scopedResourceIds?.length?{scopeIds:resource.scopedResourceIds}:{}),sources:[`legacy:${resource.source}`]});
  }
  if(!includeProjects)return ctx;
  return withTrackingProjects(ctx,projectRecords || projects || await Board.find({workspaceId,isDeleted:{$ne:true}}).select(trackingProjectFields).lean(),{loadAssignmentData:assignmentsRequired});
}
// Resolve only the candidate page using the already authenticated request
// context. This avoids rebuilding membership, role and override state twice.
export async function withTrackingProjects(ctx,projects,{loadAssignmentData=true}={}){
  if(loadAssignmentData)await loadAssignments(ctx);
  if(process.env.AUTHZ_V2==='enforce'||ctx.status!=='active'||ctx.kind==='guest')return ctx;
  const principal=ctx.trackingPrincipal,workspaceId=ctx.workspaceId,userId=ctx.userId;
  if(!principal)return ctx;
  const membership=principal;
  const {canUserAccessBoard}=await import('../../controllers/boardController.js');
  // Reuse the authoritative board access helper without repeating department
  // and three assignment scans for every project in the workspace.
  if(!ctx.trackingBoardAccessFacts){
    const [departments,assigned,legacyAssignments]=membership.role==='admin'?[[],[],[]]:await Promise.all([
      Department.find({workspaceId,$or:[{members:userId},{managers:userId}]}).select('_id').lean(),getAssignmentBasedBoardIds(userId),Card.distinct('board',{workspaceId,assignees:userId})
    ]);
    ctx.trackingBoardAccessFacts={departmentIds:new Set(departments.map(p=>id(p))),assignedBoardIds:new Set([...assigned,...legacyAssignments].map(id))};
  }
  projects=projects.filter(p=>id(p.workspaceId)===id(workspaceId));
  ctx.trackingProjectRecords=projects;
  const visible=[];
  for(const project of projects){
    // Preserve the existing selected-project restriction even where the
    // legacy helper returns early for owner/member/public visibility.
    if(membership.accessType==='selected_projects'&&membership.role!=='admin'&&!(membership.allowedProjects||[]).some(p=>id(p)===id(project._id)))continue;
    if(await canUserAccessBoard(project,principal,ctx.trackingBoardAccessFacts))visible.push(id(project._id));
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
