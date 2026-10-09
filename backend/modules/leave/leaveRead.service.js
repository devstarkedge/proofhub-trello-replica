import { validateDateRange } from '../../utils/calendarDateRange.js';
import mongoose from 'mongoose';
import Workspace from '../../models/Workspace.js';
import LeaveRequest, { PENDING_STATUSES, APPROVED_STATUSES, CANCELLED_STATUSES } from './leaveRequest.model.js';
import LeaveRequestDay from './leaveRequestDay.model.js';
import { getLeaveDashboardScope, getManagedEmployeeIds } from './leaveAuthorization.service.js';
import { getWorkspaceTimezone, dateOnlyToInstant, instantToDateOnlyKey } from './leaveTimezone.util.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';

export { PENDING_STATUSES, APPROVED_STATUSES, CANCELLED_STATUSES };
export const STATUS_FILTERS = { pending: PENDING_STATUSES, approved: APPROVED_STATUSES, rejected: ['REJECTED'], cancelled: CANCELLED_STATUSES };

export async function resolveLeaveReadScope({ viewer, workspaceId }) {
  const scope = await getLeaveDashboardScope({ user: viewer, workspaceId });
  const viewerId = viewer._id || viewer.id;
  if (scope.scope === 'workspace') return { workspaceId: new mongoose.Types.ObjectId(workspaceId) };
  if (scope.scope === 'department') {
    const ids = await getManagedEmployeeIds({ workspaceId, managerId: viewerId });
    return { workspaceId: new mongoose.Types.ObjectId(workspaceId), requester: { $in: [...new Set([...ids.map(String), String(viewerId)])].map((id) => new mongoose.Types.ObjectId(id)) } };
  }
  return { workspaceId: new mongoose.Types.ObjectId(workspaceId), requester: new mongoose.Types.ObjectId(viewerId) };
}


const populateRequest = (query) => query
  .populate('requester', 'name email avatar designation employeeId')
  .populate('requesterDepartmentIds', 'name')
  .populate('leaveType', 'name color category');

export async function getLeaveDashboardRecords({ viewer, workspaceId, status = 'pending', page = 1, limit = 20 }) {
  if (typeof status !== 'string' || (!Object.hasOwn(STATUS_FILTERS, status) && !['all', 'today'].includes(status))) throw new ErrorResponse('Invalid leave status filter', 400);
  page = Number(page); limit = Number(limit);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new ErrorResponse('Invalid pagination', 400);
  const scope = await resolveLeaveReadScope({ viewer, workspaceId });
  const workspace = await Workspace.findById(workspaceId).select('timezone').lean();
  const timezone = getWorkspaceTimezone(workspace);
  const today = instantToDateOnlyKey(new Date(), timezone);
  const dayStart = dateOnlyToInstant(today, timezone);
  // Day snapshots are the authoritative workspace dates. Older request
  // headers store date-only strings cast to UTC midnight by Mongoose.
  const consumingIds = await LeaveRequestDay.distinct('request', { workspaceId, date: dayStart, isConsuming: true });
  const todayRequests = await LeaveRequest.find({ ...scope, _id: { $in: consumingIds }, status: { $in: APPROVED_STATUSES } }).select('_id requester').lean();
  const counts = await LeaveRequest.aggregate([{ $match: scope }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
  const summary = Object.fromEntries(Object.entries(STATUS_FILTERS).map(([key, statuses]) => [key, counts.filter((c) => statuses.includes(c._id)).reduce((n, c) => n + c.count, 0)]));
  summary.today = new Set(todayRequests.map((r) => String(r.requester))).size;
  const filter = { ...scope, ...(status === 'today' ? { _id: { $in: todayRequests.map((r) => r._id) } } : STATUS_FILTERS[status] ? { status: { $in: STATUS_FILTERS[status] } } : {}) };
  const [total, requests] = await Promise.all([
    LeaveRequest.countDocuments(filter),
    populateRequest(LeaveRequest.find(filter)).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean()
  ]);
  const days = await LeaveRequestDay.find({ workspaceId, request: { $in: requests.map((r) => r._id) } }).select('request date dayType shortLeaveStartTime shortLeaveEndTime shortLeaveDurationMinutes').sort({ date: 1 }).lean();
  const daysByRequest = new Map();
  days.forEach((day) => { const key = String(day.request); if (!daysByRequest.has(key)) daysByRequest.set(key, []); daysByRequest.get(key).push(day); });
  return { summary, requests: requests.map((r) => {
    const requestDays = daysByRequest.get(String(r._id)) || [];
    return { ...r, days: requestDays, startDateKey: requestDays.length ? instantToDateOnlyKey(requestDays[0].date, timezone) : null, endDateKey: requestDays.length ? instantToDateOnlyKey(requestDays.at(-1).date, timezone) : null };
  }), total, page, limit, today, timezone };
}

export async function getLeaveCalendarEvents({ viewer, workspaceId, startDate, endDate }) {
  validateDateRange(startDate, endDate, 93);
  const scope = await resolveLeaveReadScope({ viewer, workspaceId });
  const workspace = await Workspace.findById(workspaceId).select('timezone').lean();
  const timezone = getWorkspaceTimezone(workspace);
  const start = dateOnlyToInstant(startDate, timezone);
  const end = dateOnlyToInstant(endDate, timezone);
  const matchingIds = await LeaveRequestDay.distinct('request', { workspaceId, date: { $gte: start, $lte: end } });
  const requests = await populateRequest(LeaveRequest.find({ ...scope, _id: { $in: matchingIds }, status: { $in: [...PENDING_STATUSES, ...APPROVED_STATUSES] } })).lean();
  const byId = new Map(requests.map((r) => [String(r._id), r]));
  const days = await LeaveRequestDay.find({ workspaceId, request: { $in: requests.map((r) => r._id) }, date: { $gte: start, $lte: end } }).sort({ date: 1, _id: 1 }).lean();
  return { timezone, events: days.map((day) => ({ ...day, dateKey: instantToDateOnlyKey(day.date, timezone), request: byId.get(String(day.request)), pending: PENDING_STATUSES.includes(byId.get(String(day.request)).status) })) };
}
