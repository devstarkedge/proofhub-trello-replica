import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import Role from '../../models/Role.js';
import Department from '../../models/Department.js';
const id=v=>String(v?._id||v||'');
export const departmentsOf=m=>(m?.departments||m?.department||[]).map(id);
export async function trackingRole(member,workspaceId) {
  if(!member||member.status!=='active'||member.kind==='guest')return null;
  const role=member.roleId?await Role.findById(member.roleId).lean():await Role.findResolvable(member.role,workspaceId).lean();
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
