import mongoose from 'mongoose';
import {DateTime} from 'luxon';
import Card from '../models/Card.js';
import Board from '../models/Board.js';
import Label from '../models/Label.js';
import List from '../models/List.js';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import {getManagedDepartmentIds} from '../modules/organization/departmentScopeFacade.js';
import {loadAssignments} from '../authz/loaders.js';
import {resourceReadFilter} from './resourceReadFilter.js';
import {ErrorResponse} from '../middleware/errorHandler.js';

const id = value => String(value?._id || value || '');
const oid = value => new mongoose.Types.ObjectId(id(value));

export async function readCalendarTasks(req) {
  const workspaceId = req.workspaceId, actor = req.user?._id || req.user?.id;
  if (!mongoose.isValidObjectId(workspaceId) || !mongoose.isValidObjectId(actor)) throw new ErrorResponse('Workspace membership required',403);
  const membership = req.workspaceMembership || await WorkspaceMembership.findOne({workspace:workspaceId,user:actor,status:'active'}).lean();
  if (!membership || membership.status !== 'active' || id(membership.workspace)!==id(workspaceId) || id(membership.user)!==id(actor)) throw new ErrorResponse('Workspace membership required',403);
  req.user = {...req.user, role:membership.role, roleId:membership.roleId, workspaceId, department:membership.department || [], restriction:membership.restriction, accessType:membership.accessType, allowedProjects:membership.allowedProjects || []};
  const workspace = await Workspace.findById(workspaceId).select('timezone isActive status').lean();
  if (!workspace) throw new ErrorResponse('Workspace not found',404);
  if (workspace.isActive===false || ['suspended','archived'].includes(workspace.status)) throw new ErrorResponse('Workspace is not active',403);
  const timezone = workspace.timezone || 'UTC', {start,end,departmentId,endExclusive,includeAssigned} = req.query;
  if (typeof start !== 'string' || typeof end !== 'string' || start.length>64 || end.length>64) throw new ErrorResponse('A valid start and end date are required',400);
  if (endExclusive !== undefined && !['true','false'].includes(endExclusive)) throw new ErrorResponse('Invalid calendar range',400);
  if (includeAssigned !== undefined && !['true','false'].includes(includeAssigned)) throw new ErrorResponse('Invalid calendar assignment filter',400);
  const from=DateTime.fromISO(start,{zone:timezone}).startOf('day'), last=DateTime.fromISO(end,{zone:timezone}).startOf('day');
  const until=endExclusive==='true'?last:last.plus({days:1});
  if (!from.isValid || !until.isValid || until<=from || until.diff(from,'days').days>367) throw new ErrorResponse('Choose a valid calendar range of at most one year',400);
  if (departmentId && departmentId!=='all' && (typeof departmentId!=='string' || !mongoose.isValidObjectId(departmentId))) throw new ErrorResponse('Invalid department',400);
  const permissions = await resourceReadFilter(req,'task',undefined,{calendarScope:true});
  const assignments = req.projectAuthz || {workspaceId, userId:actor};
  if ((membership.role !== 'admin' || ['assigned_only','assigned_tasks'].includes(membership.restriction?.type || membership.accessType)) && !assignments.assignmentsLoaded) await loadAssignments(assignments);
  const managed = membership.role==='manager' ? await getManagedDepartmentIds({workspaceId,managerId:actor,membership}) : [];
  const managedForView = departmentId && departmentId!=='all' ? managed.filter(department=>id(department)===departmentId) : managed;
  const boardConditions = [{workspaceId:oid(workspaceId),isDeleted:{$ne:true}}];
  if (departmentId && departmentId!=='all' && (membership.role==='admin' || includeAssigned!=='true')) boardConditions.push({department:oid(departmentId)});
  if (membership.role!=='admin') boardConditions.push({$or:[{_id:{$in:(assignments.assignedProjectIds || []).map(oid)}},...(managedForView.length?[{department:{$in:managedForView.map(oid)}}]:[])]});
  const restriction = membership.restriction?.type || membership.accessType;
  if (restriction==='selected_projects') boardConditions.push({_id:{$in:(membership.restriction?.projectIds || membership.allowedProjects || []).map(oid)}});
  const boards = await Board.find({$and:boardConditions}).select('_id name department').lean();
  if (!boards.length) return {tasks:[],groupedByDate:{},dateRange:{start:from.toJSDate(),end:until.minus({milliseconds:1}).toJSDate()},timezone};
  const assigned = {$or:[{assignees:oid(actor)},{members:oid(actor)},{_id:{$in:(assignments.assignedTaskIds || []).map(oid)}}]};
  const boardMap = new Map(boards.map(board=>[id(board),board]));
  const conditions = [
    {workspaceId:oid(workspaceId),board:{$in:boards.map(board=>board._id)},isArchived:{$ne:true}}, permissions,
    {$or:[{startDate:{$gte:from.toJSDate(),$lt:until.toJSDate()}},{dueDate:{$gte:from.toJSDate(),$lt:until.toJSDate()}}]}
  ];
  if (membership.role!=='admin') conditions.push(membership.role==='manager'
    ? {$or:[assigned,{board:{$in:boards.filter(board=>managedForView.some(department=>id(department)===id(board.department))).map(board=>board._id)}}]}
    : assigned);
  if (['assigned_only','assigned_tasks'].includes(restriction)) conditions.push(assigned);
  const records = await Card.find({$and:conditions}).select('title description startDate dueDate priority status createdFrom assignees labels subtaskStats createdAt updatedAt board list createdBy hasRecurrence recurringTask')
    .populate({path:'assignees',model:User,select:'name email avatar'})
    .populate({path:'list',model:List,match:{workspaceId},select:'title color'})
    .populate({path:'labels',model:Label,match:{workspaceId},select:'name color'})
    .sort({startDate:1,dueDate:1,_id:1}).limit(5001).maxTimeMS(20000).lean();
  if (records.length>5000) throw new ErrorResponse('More than 5,000 scheduled tasks match this range. Choose a shorter period or department.',413);
  const tasks = records.map(({board,list,...task})=>({...task,project:boardMap.get(id(board)),listTitle:list?.title || task.status || 'N/A',listColor:list?.color}));
  const groupedByDate = {};
  for (const task of tasks) for (const [type,value] of [['start',task.startDate],['due',task.dueDate]]) {
    if (!value || +new Date(value)<+from || +new Date(value)>=+until) continue;
    const date=DateTime.fromJSDate(new Date(value),{zone:timezone}).toISODate();
    const entries=groupedByDate[date] ||= [], existing=entries.find(entry=>id(entry)===id(task));
    if (existing) existing.indicators.push(type);
    else entries.push({...task,indicators:[type]});
  }
  return {tasks,groupedByDate,dateRange:{start:from.toJSDate(),end:until.minus({milliseconds:1}).toJSDate()},timezone};
}
