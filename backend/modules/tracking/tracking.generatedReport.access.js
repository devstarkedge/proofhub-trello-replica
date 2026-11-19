import { trackingContext, can as canTrackProject } from './tracking.authorization.js';
import { buildContext } from '../../authz/context.js';
import { resolveResourceAccess } from '../permissions/permissionEngine.js';
import { DateTime } from 'luxon';
import mongoose from 'mongoose';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import Workspace from '../../models/Workspace.js';
import User from '../../models/User.js';
import Role from '../../models/Role.js';
import Department from '../../models/Department.js';
import Board from '../../models/Board.js';
import Card from '../../models/Card.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { validateReportRecipients } from '../../services/analytics/analyticsReportService.js';
export const reportId = value => String(value?._id || value || '');
export const reportError = (message, status = 400) => { throw new ErrorResponse(message,status); };
const supported = ['admin','hr','manager'];

export async function generatedReportAccess(workspaceId, userId) {
  const [membership,user,workspace] = await Promise.all([
    WorkspaceMembership.findOne({ workspace:workspaceId,user:userId,status:'active',kind:{$ne:'guest'} }).lean(),
    User.findOne({_id:userId,isActive:true}).select('name email isSuperAdmin').lean(),
    Workspace.findOne({_id:workspaceId,isActive:true}).select('timezone').lean()
  ]);
  if (!membership || !user || user.isSuperAdmin || !workspace || !supported.includes(membership.role)) reportError('Time tracking exports require an Admin, HR or Manager workspace role',403);
  if (membership.roleId) {
    const role = await Role.collection.findOne({_id:membership.roleId,isActive:{$ne:false},$or:[{workspaceId:new mongoose.Types.ObjectId(workspaceId)},{workspaceId:null,isSystem:true}]});
    if (!role?.isSystem || role.slug !== membership.role) reportError('This workspace role cannot export time tracking reports',403);
  }
  // Reuse the existing deny engines. The new role-specific export floor must
  // never revive access explicitly removed through either permission system.
  const [permissionContext,resourceAccess] = await Promise.all([
    membership.role==='manager' ? trackingContext(workspaceId,userId,{readOnly:true}) : buildContext(userId,workspaceId,{allowLegacy:true}),
    resolveResourceAccess({...membership,_id:userId,id:userId,workspaceId},'tracking',workspaceId)
  ]);
  if(resourceAccess.source==='deny-override' || (permissionContext.denies['tracking.view_reports']||[]).some(deny=>!deny.expiresAt || +new Date(deny.expiresAt)>Date.now())) reportError('Time tracking report access is denied',403);
  const departments = await Department.find({isActive:{$ne:false},...(membership.role === 'manager' ? {managers:userId} : {})}).select('name members managers').lean();
  const allowedDepartments = new Set(departments.map(d=>reportId(d._id)));
  const visibleProjectIds = membership.role==='manager' ? new Set((permissionContext.trackingProjectRecords||[]).filter(project=>allowedDepartments.has(reportId(project.department))&&canTrackProject(permissionContext,'project.view',project)).map(project=>reportId(project._id))) : null;
  const memberships = await WorkspaceMembership.find({workspace:workspaceId,status:'active',kind:{$ne:'guest'},role:{$nin:['admin','superadmin','super-admin','super_admin']}}).lean();
  const excludedRoles = await Role.collection.find({ _id: { $in: memberships.map(member=>member.roleId).filter(Boolean) }, slug: { $in: ['admin','superadmin','super-admin','super_admin'] }, $or: [{ workspaceId: new mongoose.Types.ObjectId(workspaceId) }, { workspaceId: null, isSystem: true }] }).project({_id:1}).toArray();
  const excludedRoleIds = new Set(excludedRoles.map(role=>reportId(role._id)));
  const users = await User.find({_id:{$in:memberships.map(m=>m.user)},isActive:true,isSuperAdmin:{$ne:true}}).select('name email avatar').lean();
  const byUser = new Map(memberships.map(m=>[reportId(m.user),m]));
  const subjects = users.filter(person=>!excludedRoleIds.has(reportId(byUser.get(reportId(person._id)).roleId))).map(person=>{
    const member = byUser.get(reportId(person._id));
    const ids = new Set([...(member.department || []),...(member.departments || [])].map(reportId));
    for (const department of departments) if ([...(department.members||[]),...(department.managers||[])].some(value=>reportId(value)===reportId(person._id))) ids.add(reportId(department._id));
    return {...person,departmentIds:[...ids].filter(value=>allowedDepartments.has(value))};
  }).filter(person=>membership.role !== 'manager' || person.departmentIds.length).sort((a,b)=>a.name.localeCompare(b.name));
  return {workspaceId,userId,role:membership.role,user,timezone:workspace.timezone || 'Asia/Kolkata',departments,allowedDepartments,visibleProjectIds,subjects};
}

export async function validateGeneratedReportFilters(access, input) {
  const filters = { period:input.period, timezone:access.timezone };
  let start, end;
  if (input.period === 'weekly' && /^\d{4}-\d{2}-\d{2}$/.test(input.startDate || '')) {
    start = DateTime.fromISO(input.startDate,{zone:access.timezone}).startOf('day'); end = start.plus({days:7});
    if (input.endDate && input.endDate !== end.minus({days:1}).toISODate()) reportError('Weekly reports must cover seven calendar days');
  } else if (input.period === 'monthly' && /^\d{4}-\d{2}$/.test(input.month || '')) {
    start = DateTime.fromISO(`${input.month}-01`,{zone:access.timezone}); end=start.plus({months:1}); filters.month=input.month;
  } else reportError('Select a weekly start date or a monthly reporting month');
  const tomorrow = DateTime.now().setZone(access.timezone).plus({ days: 1 }).startOf('day');
  if (!start.isValid || !end.isValid || start.year < 2020 || start >= tomorrow) reportError('Invalid reporting period');
  if (end > tomorrow) end = tomorrow;
  Object.assign(filters,{startDate:start.toISODate(),endDate:end.minus({days:1}).toISODate(),startAt:start.toUTC().toISO(),endAt:end.toUTC().toISO()});
  for (const field of ['departmentId','userId','projectId','taskId']) if (input[field]) {
    if (!mongoose.isValidObjectId(input[field])) reportError('Invalid report filter'); filters[field]=String(input[field]);
  }
  if (filters.departmentId && !access.allowedDepartments.has(filters.departmentId)) reportError('Department is outside your report scope',403);
  const subjects = access.subjects.filter(person=>(!filters.userId || reportId(person._id)===filters.userId) && (!filters.departmentId || person.departmentIds.includes(filters.departmentId)));
  if (filters.userId && !subjects.length) reportError('Employee is outside your report scope',403);
  if (filters.projectId) {
    const project=await Board.findOne({_id:filters.projectId,isDeleted:{$ne:true}}).select('department').lean();
    if (!project || access.visibleProjectIds && !access.visibleProjectIds.has(filters.projectId) || access.role==='manager' && !access.allowedDepartments.has(reportId(project.department)) || filters.departmentId && reportId(project.department)!==filters.departmentId) reportError('Project is outside your report scope',403);
  }
  if (filters.taskId) {
    if (!filters.projectId || !await Card.exists({_id:filters.taskId,board:filters.projectId})) reportError('Select a task within the selected project');
  }
  if (input.status) { if (!['RUNNING','PAUSED','CLOSED'].includes(input.status)) reportError('Invalid tracking status'); filters.status=input.status; }
  return {filters,subjectIds:subjects.map(person=>person._id),departmentIds:filters.departmentId ? [filters.departmentId] : access.departments.map(d=>d._id)};
}
export function assertGeneratedReportScope(access, report) {
  if (access.role==='manager' && reportId(report.createdBy)!==reportId(access.userId)) reportError('Report not found',404);
  if(access.visibleProjectIds && ((report.projectIds||[]).some(value=>!access.visibleProjectIds.has(reportId(value))) || report.filters.projectId && !access.visibleProjectIds.has(report.filters.projectId))) reportError('Report project access changed. Generate a new report with your current permissions.',403);
  const subjects=new Set(access.subjects.map(person=>reportId(person._id)));
  if ((report.subjectIds||[]).some(value=>!subjects.has(reportId(value))) || (report.departmentIds||[]).some(value=>!access.allowedDepartments.has(reportId(value)))) reportError('Report scope changed. Generate a new report with your current permissions.',403);
}
export async function generatedReportRecipients(access, values) {
  const email = String(access.user.email || '').trim().toLowerCase();
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) reportError('Your account needs a valid email address before this report can be emailed.');
  if (values && (!Array.isArray(values) || values.length !== 1 || typeof values[0] !== 'string' || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(values[0].trim()))) reportError('Provide your account email address.');
  if (values && values[0].trim().toLowerCase() !== email) {
    reportError('Reports can only be emailed to your signed-in account.', 403);
  }
  await validateReportRecipients(access.userId, access.workspaceId, [email]);
  return [email];
}
