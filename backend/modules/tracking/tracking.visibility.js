import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import Role from '../../models/Role.js';
import Department from '../../models/Department.js';
import Board from '../../models/Board.js';
import {ActivityInterval} from './tracking.models.js';
import {can,trackingProjectFields} from './tracking.authorization.js';
const id=v=>String(v?._id||v||'');
export const departmentsOf=m=>(m?.departments||m?.department||[]).map(id);
export async function trackingRole(member,workspaceId,resolvedRole=undefined) {
  if(!member||member.status!=='active'||member.kind==='guest')return null;
  const role=resolvedRole!==undefined?resolvedRole:member.roleId?await Role.findById(member.roleId).lean():await Role.findResolvable(member.role,workspaceId).lean();
  if(role && (!role.isActive || role.workspaceId && id(role.workspaceId)!==id(workspaceId)))return null;
  // Custom roles cannot inherit manager/admin visibility from a name or grant.
  return role && !role.isSystem?'custom': ['admin','manager'].includes(role?.slug||member.role)?(role?.slug||member.role):'employee';
}
export async function historicalDepartmentScope(workspaceId,viewerId,ownerId) {
  const [viewer,owner]=await Promise.all([WorkspaceMembership.findOne({workspace:workspaceId,user:viewerId,status:'active'}).lean(),WorkspaceMembership.findOne({workspace:workspaceId,user:ownerId,status:'active'}).lean()]);
  if(!viewer||viewer.kind==='guest')return [];
  if(id(viewerId)===id(ownerId))return null;
  const viewerRole=await trackingRole(viewer,workspaceId);
  if(viewerRole==='admin')return null;
  if(viewerRole!=='manager'||!owner)return [];
  const ownerRole=await trackingRole(owner,workspaceId);
  if(!['employee','custom'].includes(ownerRole))return [];
  const assigned=await Department.find({workspaceId,managers:viewerId,isActive:{$ne:false}}).select('_id').lean();
  return assigned.map(id).filter(d=>departmentsOf(owner).includes(d));
}
export async function trackingVisibility(workspaceId,viewerId,ownerId,historicalDepartments,requireHistory=true) {
  const eligible=await historicalDepartmentScope(workspaceId,viewerId,ownerId);
  return eligible===null || eligible.length>0 && (!requireHistory || Array.isArray(historicalDepartments)&&historicalDepartments.some(d=>eligible.includes(id(d))));
}

// Authorization is shared only within one HTTP request, never across viewers.
export async function readVisibilityScope(ctx){
  if(ctx.trackingReadScope)return ctx.trackingReadScope;
  const workspaceId=ctx.workspaceId,viewerId=ctx.userId;
  const [members,projects]=await Promise.all([
    ctx.trackingMembers||WorkspaceMembership.find({workspace:workspaceId,status:'active',kind:{$ne:'guest'}}).lean(),
    ctx.trackingProjectRecords||Board.find({workspaceId}).select(trackingProjectFields).lean()
  ]);
  const [roles,assigned]=await Promise.all([
    Role.find({$or:[{_id:{$in:members.map(m=>m.roleId).filter(Boolean)}},{slug:{$in:members.filter(m=>!m.roleId).map(m=>m.role)}}]}).lean(),
    ctx.resolvedRecords?.departments||Department.find({workspaceId,managers:viewerId,isActive:{$ne:false}}).select('_id').lean()
  ]);
  const roleMap=new Map();for(const m of members){const role=m.roleId?roles.find(r=>id(r)===id(m.roleId)):roles.find(r=>r.slug===m.role&&id(r.workspaceId)===id(workspaceId))||roles.find(r=>r.slug===m.role&&r.isSystem);roleMap.set(id(m.user),await trackingRole(m,workspaceId,role||null));}
  const viewerRole=roleMap.get(id(viewerId)),memberMap=new Map(members.map(m=>[id(m.user),m])),projectMap=new Map(projects.map(p=>[id(p),p])),mixedSessions=new Set();
  const history=owner=>{if(id(owner)===id(viewerId)||viewerRole==='admin')return null;const member=memberMap.get(id(owner));if(viewerRole!=='manager'||!['employee','custom'].includes(roleMap.get(id(owner))))return [];return assigned.map(id).filter(d=>departmentsOf(member).includes(d));};
  const canOwner=(owner,permission='tracking.view_reports')=>{if(ctx.trackingDenied)return false;const member=memberMap.get(id(owner));if(!member)return false;if(id(owner)===id(viewerId))return true;const scope=history(owner);return (scope===null||scope.length>0)&&can(ctx,permission,{workspaceId,user:owner,departments:departmentsOf(member)});};
  const canRecord=(session,permission='tracking.view_reports')=>{
    if(!session||id(session.workspaceId)!==id(workspaceId)||!canOwner(session.user,permission))return false;
    if(id(session.user)===id(viewerId))return true;
    const scope=history(session.user);if(scope!==null&&(!Array.isArray(session.departmentIdsAtStart)||!session.departmentIdsAtStart.some(d=>scope.includes(id(d)))))return false;
    if(permission==='tracking.view_reports'&&mixedSessions.has(id(session)))return false;
    const projectIds=[...new Set((session.segments||[]).flatMap(s=>[s.project,s.attributedProject]).filter(Boolean).map(id))];
    return projectIds.every(key=>projectMap.has(key)&&can(ctx,'project.view',projectMap.get(key)));
  };
  const markMixed=async sessions=>{
    if(viewerRole!=='manager')return;
    const ids=sessions.filter(s=>id(s.user)!==id(viewerId)).map(s=>s._id);if(!ids.length)return;
    const grouped=await ActivityInterval.aggregate([{$match:{session:{$in:ids}}},{$group:{_id:'$session',departments:{$addToSet:'$departmentIdsAtCapture'}}}]);
    const byId=new Map(sessions.map(s=>[id(s),s]));for(const row of grouped){const scope=history(byId.get(id(row))?.user);if(scope!==null&&(row.departments||[]).some(ds=>!Array.isArray(ds)||!(ds||[]).some(d=>scope.includes(id(d)))))mixedSessions.add(id(row));}
  };
  const scope={members,memberMap,roleMap,viewerRole,projectMap,history,canOwner,canRecord,markMixed};ctx.trackingReadScope=scope;return scope;
}
