import mongoose from 'mongoose';
import Workspace from '../../models/Workspace.js';
import Department from '../../models/Department.js';
import User from '../../models/User.js';
import AuditLog from '../../models/AuditLog.js';
import LeaveRequest, { PENDING_STATUSES, APPROVED_STATUSES, CANCELLED_STATUSES } from './leaveRequest.model.js';
import LeaveRequestDay from './leaveRequestDay.model.js';
import LeaveApproval from './leaveApproval.model.js';
import LeaveType from './leaveType.model.js';
import { resolveLeaveAccessScope } from './leaveAuthorization.service.js';
import { getLeaveActionContext, requestActions, orderStages } from './leaveActionEligibility.service.js';
import { getWorkspaceTimezone, dateOnlyToInstant, instantToDateOnlyKey } from './leaveTimezone.util.js';
import { validateDateRange } from '../../utils/calendarDateRange.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';

const statusGroups = { pending: PENDING_STATUSES, approved: APPROVED_STATUSES, rejected: ['REJECTED'], cancelled: CANCELLED_STATUSES, cancellation: ['CANCELLATION_REQUESTED'], history: [...APPROVED_STATUSES, 'REJECTED', ...CANCELLED_STATUSES, 'EXPIRED'] };
const objectId = (value) => {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw new ErrorResponse('Invalid request filter ID', 400);
  return new mongoose.Types.ObjectId(value);
};
const populate = (query, detail = false) => {
  query.populate('requester', 'name email avatar designation employeeId').populate('requesterDepartmentIds', 'name').populate('leaveType', 'name color category');
  return detail ? query.populate('policyVersion', 'versionNumber policy') : query;
};

async function todayRequestPipeline({ workspaceId, scope, timezone, today }) {
  return LeaveRequestDay.aggregate([
    { $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId), date: dateOnlyToInstant(today, timezone), isConsuming: true } },
    { $group: { _id: '$request' } },
    { $lookup: { from: LeaveRequest.collection.name, localField: '_id', foreignField: '_id', pipeline: [
      { $match: { ...scope, status: { $in: APPROVED_STATUSES } } }, { $project: { requester: 1 } }
    ], as: 'request' } },
    { $unwind: '$request' },
    { $project: { _id: 1, requester: '$request.requester' } }
  ]);
}

export async function queryLeaveSummary({ viewer, workspaceId, visibility, workspace }) {
  const [resolved, settings] = await Promise.all([
    visibility || resolveLeaveAccessScope({ viewer, workspaceId }),
    workspace || Workspace.findById(workspaceId).select('timezone').lean()
  ]);
  const timezone = getWorkspaceTimezone(settings), today = instantToDateOnlyKey(new Date(), timezone);
  const [counts, todayRequests] = await Promise.all([
    LeaveRequest.aggregate([{ $match: resolved.requestFilter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    todayRequestPipeline({ workspaceId, scope: resolved.requestFilter, timezone, today })
  ]);
  const summary = Object.fromEntries(Object.entries(statusGroups).filter(([key]) => !['history', 'cancellation'].includes(key)).map(([key, statuses]) => [key, counts.filter((row) => statuses.includes(row._id)).reduce((sum, row) => sum + row.count, 0)]));
  summary.today = new Set(todayRequests.map((request) => String(request.requester))).size;
  return { summary, today, timezone };
}

function actionableMatch(context) {
  const delegated = context.access.source === 'override' && (context.access.actions.approve_assigned || context.access.actions.reject_assigned);
  const allowed = context.access.source === 'deny-override' ? false : { $or: [
    delegated === true,
    { $and: [{ $eq: ['$$stage.level', 'DEPARTMENT_MANAGER'] }, { $in: ['$requester', [...context.managedIds].map((id) => new mongoose.Types.ObjectId(id))] }] },
    { $and: [{ $eq: ['$$stage.level', 'HR'] }, context.user.role === 'hr'] },
    { $and: [{ $eq: ['$$stage.level', 'ADMIN'] }, context.user.role === 'admin'] }
  ] };
  return { $and: [
    { $in: ['$status', PENDING_STATUSES] }, { $ne: ['$requester', new mongoose.Types.ObjectId(context.userId)] },
    { $gt: [{ $size: { $filter: { input: '$_stages', as: 'stage', cond: { $and: [
      { $eq: ['$$stage.status', 'PENDING'] }, { $in: [new mongoose.Types.ObjectId(context.userId), { $ifNull: ['$$stage.eligibleApproverUserIds', []] }] }, allowed,
      { $or: [{ $ne: ['$$stage.level', 'ADMIN'] }, context.user.role === 'admin'] },
      { $or: [{ $ne: ['$$stage.mode', 'SEQUENTIAL'] }, { $ne: ['$$stage.level', 'ADMIN'] },
        { $gt: [{ $size: { $filter: { input: '$_stages', as: 'support', cond: { $and: [
          { $in: ['$$support.level', ['DEPARTMENT_MANAGER', 'HR']] }, { $eq: ['$$support.status', 'APPROVED'] }
        ] } } } }, 0] }] }
    ] } } } }, 0] }
  ] };
}

export async function queryLeaveRequests({ viewer, workspaceId, status = 'all', view = 'all', page = 1, limit = 20, departmentId, employeeId, leaveTypeId, startDate, endDate, q = '', sort = 'newest', includeSummary = true, after }) {
  if (typeof status !== 'string' || (!Object.hasOwn(statusGroups, status) && !['all', 'today'].includes(status))) throw new ErrorResponse('Invalid leave status filter', 400);
  if (!['all', 'mine', 'approval', 'history'].includes(view) || !['newest', 'oldest', 'leave_date'].includes(sort)) throw new ErrorResponse('Invalid leave request view or sort', 400);
  page = Number(page); limit = Number(limit);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100 || typeof q !== 'string' || q.length > 100) throw new ErrorResponse('Invalid pagination or search', 400);
  const context = await getLeaveActionContext({ viewer, workspaceId });
  const visibility = context.visibility;
  const scope = visibility.requestFilter;
  const timezone = getWorkspaceTimezone(context.workspace);
  const today = instantToDateOnlyKey(new Date(), timezone);
  const filters = [scope];
  if (view === 'mine') filters.push({ requester: new mongoose.Types.ObjectId(context.userId) });
  if (view === 'history') filters.push({ status: { $in: statusGroups.history } });
  if (statusGroups[status]) filters.push({ status: { $in: statusGroups[status] } });
  if (view === 'approval') filters.push({ status: { $in: [...PENDING_STATUSES, 'CANCELLATION_REQUESTED'] }, requester: { $ne: new mongoose.Types.ObjectId(context.userId) } });
  if (status === 'today') {
    const todayRequests = await todayRequestPipeline({ workspaceId, scope, timezone, today });
    filters.push({ _id: { $in: todayRequests.map((request) => request._id) } });
  }
  if (employeeId) filters.push({ requester: objectId(employeeId) });
  if (leaveTypeId) filters.push({ leaveType: objectId(leaveTypeId) });
  if (departmentId) {
    // An out-of-scope filter can only narrow the authorized base query.
    filters.push({ requesterDepartmentIds: objectId(departmentId) });
  }
  let dayRange;
  if (startDate || endDate) {
    if (!startDate || !endDate) throw new ErrorResponse('Both date boundaries are required', 400);
    validateDateRange(startDate, endDate, 3660);
    dayRange = { $gte: dateOnlyToInstant(startDate, timezone), $lte: dateOnlyToInstant(endDate, timezone) };
  }
  const sorting = sort === 'leave_date' ? { startDate: 1, _id: 1 } : { createdAt: sort === 'oldest' ? 1 : -1, _id: sort === 'oldest' ? 1 : -1 };
  const pipeline = [{ $match: { $and: filters } }, { $sort: sorting }];
  if (dayRange) pipeline.push({ $lookup: { from: LeaveRequestDay.collection.name, localField: '_id', foreignField: 'request', pipeline: [
    { $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId), date: dayRange } }, { $limit: 1 }, { $project: { _id: 1 } }
  ], as: '_dates' } }, { $match: { '_dates.0': { $exists: true } } });
  if (q.trim()) {
    const regex = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pipeline.push({ $lookup: { from: User.collection.name, localField: 'requester', foreignField: '_id', pipeline: [{ $project: { name: 1, email: 1, employeeId: 1 } }], as: '_person' } },
      { $match: { $or: [{ '_person.name': { $regex: regex, $options: 'i' } }, { '_person.email': { $regex: regex, $options: 'i' } }, { '_person.employeeId': { $regex: regex, $options: 'i' } }] } });
  }
  if (view === 'approval') {
    pipeline.push({ $lookup: { from: LeaveApproval.collection.name, let: { requestId: '$_id' }, pipeline: [{ $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId), $expr: { $eq: ['$request', '$$requestId'] } } }, { $project: { level: 1, sequence: 1, mode: 1, status: 1, eligibleApproverUserIds: 1 } }], as: '_stages' } });
    const cancellation = context.access.actions.cancel_approved && context.access.scope === 'full';
    pipeline.push({ $match: { $expr: { $or: [actionableMatch(context), { $and: [cancellation === true, { $eq: ['$status', 'CANCELLATION_REQUESTED'] }, { $ne: ['$requester', new mongoose.Types.ObjectId(context.userId)] }] }] } } });
  }
  const cursorFilters = [];
  if (after) {
    if (typeof after !== 'string' || after.length > 200) throw new ErrorResponse('Invalid leave cursor', 400);
    if (sort === 'leave_date') throw new ErrorResponse('Cursor pagination requires newest/oldest sort', 400);
    let cursor;
    try { cursor = JSON.parse(Buffer.from(after, 'base64url').toString()); } catch { throw new ErrorResponse('Invalid leave cursor', 400); }
    if (!cursor || !Number.isFinite(Date.parse(cursor.at))) throw new ErrorResponse('Invalid leave cursor', 400);
    const id = objectId(cursor.id), at = new Date(cursor.at), op = sort === 'oldest' ? '$gt' : '$lt';
    cursorFilters.push({ $or: [{ createdAt: { [op]: at } }, { createdAt: at, _id: { [op]: id } }] });
  }
  const departmentFilter = visibility.scope === 'workspace' ? {} : { _id: { $in: visibility.departmentIds } };
  const summaryPromise = includeSummary === false || includeSummary === 'false' ? Promise.resolve(null)
    : queryLeaveSummary({ viewer, workspaceId, visibility, workspace: context.workspace });
  // Attach handlers immediately while independent list work is in flight;
  // the original rejection is still propagated by the final Promise.all.
  summaryPromise.catch(() => {});
  const metadataPromise = Promise.all([
    Department.find({ workspaceId, isActive: true, ...departmentFilter }).select('name').sort({ name: 1 }).lean(),
    LeaveType.find({ workspaceId, isActive: true }).select('name').sort({ name: 1 }).lean()
  ]);
  metadataPromise.catch(() => {});
  let requests, total;
  const listFields = 'requester requesterDepartmentIds leaveType startDate endDate totalRequestedDayUnits totalConsumingDayUnits status blockedReason createdAt';
  if (!q.trim() && view !== 'approval' && !dayRange) {
    [requests, total] = await Promise.all([
      populate(LeaveRequest.find({ $and: [...filters, ...cursorFilters] }).select(listFields)).sort(sorting).skip(after ? 0 : (page - 1) * limit).limit(limit).lean(),
      LeaveRequest.countDocuments({ $and: filters })
    ]);
  } else {
    // One join pass for both count and rows; sorting precedes joins/facet so
    // MongoDB can consume the stable pagination indexes.
    const [result] = await LeaveRequest.aggregate([...pipeline, { $facet: {
      count: [{ $count: 'total' }],
      rows: [...(cursorFilters.length ? [{ $match: { $and: cursorFilters } }] : []), { $skip: after ? 0 : (page - 1) * limit }, { $limit: limit }, { $project: { _id: 1 } }]
    } }]);
    const rows = result.rows;
    total = result.count[0]?.total || 0;
    requests = rows.length ? await populate(LeaveRequest.find({ ...scope, _id: { $in: rows.map((row) => row._id) } }).select(listFields)).sort(sorting).lean() : [];
  }
  const [enriched, [departments, leaveTypes], summaryResult] = await Promise.all([
    enrichRequests({ requests, workspaceId, timezone, context }), metadataPromise, summaryPromise
  ]);
  const last = requests.at(-1);
  return { ...(summaryResult ? { summary: summaryResult.summary } : {}), requests: enriched, total, page, limit, today, timezone,
    nextCursor: sort !== 'leave_date' && requests.length === limit ? Buffer.from(JSON.stringify({ id: String(last._id), at: last.createdAt.toISOString() })).toString('base64url') : null,
    visibility: visibility.scope === 'none' ? 'personal' : visibility.scope,
    filters: { departments, leaveTypes, canFilterPeople: visibility.scope !== 'none', canViewMine: context.user.role !== 'admin', canApprove: context.access.source !== 'deny-override' && (context.managedIds.size > 0 || context.user.role === 'hr' || context.adminIds.has(context.userId) || context.access.actions.approve_assigned || context.access.actions.reject_assigned || context.access.actions.cancel_approved) } };
}

async function enrichRequests({ requests, workspaceId, timezone, context, detail = false }) {
  if (!requests.length) return [];
  const ids = requests.map((request) => request._id);
  const [days, approvals] = await Promise.all([
    LeaveRequestDay.find({ workspaceId, request: { $in: ids } }).select(detail ? '' : 'request date dayType shortLeaveStartTime shortLeaveEndTime shortLeaveDurationMinutes').sort({ date: 1 }).lean(),
    detail ? LeaveApproval.find({ workspaceId, request: { $in: ids } }).populate('decidedBy', 'name avatar').lean()
      : LeaveApproval.find({ workspaceId, request: { $in: ids } }).select('request level sequence mode status eligibleApproverUserIds').lean()
  ]);
  const daysById = new Map(), approvalsById = new Map();
  for (const [rows, map] of [[days, daysById], [approvals, approvalsById]]) for (const row of rows) { const id = String(row.request); if (!map.has(id)) map.set(id, []); map.get(id).push(row); }
  return requests.map((request) => {
    const requestDays = daysById.get(String(request._id)) || [];
    const stages = orderStages(approvalsById.get(String(request._id)) || []);
    return { ...request, days: requestDays, approvals: detail ? stages : stages.map(({ _id, level, sequence, mode, status }) => ({ _id, level, sequence, mode, status })), actions: requestActions({ request, stages, context }),
      progress: { total: 2, approved: Number(stages.some((stage) => stage.level === 'ADMIN' && stage.status === 'APPROVED')) + Number(stages.some((stage) => stage.level !== 'ADMIN' && stage.status === 'APPROVED')) },
      startDateKey: requestDays.length ? instantToDateOnlyKey(requestDays[0].date, timezone) : null,
      endDateKey: requestDays.length ? instantToDateOnlyKey(requestDays.at(-1).date, timezone) : null };
  });
}

export async function getAuthorizedRequestDetail({ viewer, workspaceId, requestId }) {
  const id = objectId(requestId);
  const context = await getLeaveActionContext({ viewer, workspaceId });
  const scope = context.visibility.requestFilter;
  const request = await populate(LeaveRequest.findOne({ $and: [scope, { _id: id }] }), true).lean();
  if (!request) throw new ErrorResponse('Leave request not found or not accessible', 404);
  const timezone = getWorkspaceTimezone(context.workspace);
  const [[enriched], audits] = await Promise.all([
    enrichRequests({ requests: [request], workspaceId, timezone, context, detail: true }),
    AuditLog.find({ workspace: workspaceId, category: 'leave_management', targetType: 'LeaveRequest', targetId: id }).populate('actor', 'name avatar').sort({ createdAt: 1, _id: 1 }).lean()
  ]);
  const history = audits.map((audit) => ({ id: String(audit._id), action: audit.action, actor: audit.actor, at: audit.createdAt, changes: audit.changes }));
  // Assignment events are persisted stage creation timestamps, never browser time.
  for (const stage of enriched.approvals) history.push({ id: `assignment-${stage._id}`, action: 'LEAVE_APPROVAL_ASSIGNED', level: stage.level, at: stage.createdAt });
  history.sort((a, b) => new Date(a.at) - new Date(b.at) || a.id.localeCompare(b.id));
  return { request: enriched, days: enriched.days, approvals: enriched.approvals, actions: enriched.actions, history, timezone };
}
