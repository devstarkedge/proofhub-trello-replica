import { validateDateRange } from '../../utils/calendarDateRange.js';
import Workspace from '../../models/Workspace.js';
import LeaveRequest, { PENDING_STATUSES, APPROVED_STATUSES, CANCELLED_STATUSES } from './leaveRequest.model.js';
import LeaveRequestDay from './leaveRequestDay.model.js';
import { resolveLeaveAccessScope } from './leaveAuthorization.service.js';
import { getWorkspaceTimezone, dateOnlyToInstant, instantToDateOnlyKey } from './leaveTimezone.util.js';
import mongoose from 'mongoose';
import { queryLeaveRequests } from './leaveRequestQuery.service.js';

export { PENDING_STATUSES, APPROVED_STATUSES, CANCELLED_STATUSES };
export const STATUS_FILTERS = { pending: PENDING_STATUSES, approved: APPROVED_STATUSES, rejected: ['REJECTED'], cancelled: CANCELLED_STATUSES };

export async function resolveLeaveReadScope({ viewer, workspaceId }) {
  return (await resolveLeaveAccessScope({ viewer, workspaceId })).requestFilter;
}


export async function getLeaveDashboardRecords(options) {
  return queryLeaveRequests({ ...options, status: options.status ?? 'pending' });
}

export async function getLeaveCalendarEvents({ viewer, workspaceId, startDate, endDate }) {
  validateDateRange(startDate, endDate, 93);
  const [scope, workspace] = await Promise.all([
    resolveLeaveReadScope({ viewer, workspaceId }),
    Workspace.findById(workspaceId).select('timezone').lean()
  ]);
  const timezone = getWorkspaceTimezone(workspace);
  const start = dateOnlyToInstant(startDate, timezone);
  const end = dateOnlyToInstant(endDate, timezone);
  // Start from indexed visible days, authorize inside MongoDB before returning
  // rows, and never materialize a workspace-wide request ID list in Node.
  const days = await LeaveRequestDay.aggregate([
    { $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId), date: { $gte: start, $lte: end } } },
    { $lookup: { from: LeaveRequest.collection.name, localField: 'request', foreignField: '_id', pipeline: [
      { $match: { ...scope, status: { $in: [...PENDING_STATUSES, ...APPROVED_STATUSES] } } },
      { $project: { requester: 1, requesterDepartmentIds: 1, leaveType: 1, status: 1, startDate: 1, endDate: 1 } }
    ], as: 'request' } },
    { $unwind: '$request' }, { $sort: { date: 1, _id: 1 } },
    { $project: { request: 1, date: 1, dayType: 1, calendarClassification: 1, isConsuming: 1, shortLeaveStartTime: 1, shortLeaveEndTime: 1, shortLeaveDurationMinutes: 1 } }
  ]);
  if (days.length) await LeaveRequestDay.populate(days, [
    { path: 'request.requester', model: 'User', select: 'name email avatar designation employeeId' },
    { path: 'request.requesterDepartmentIds', model: 'Department', select: 'name' },
    { path: 'request.leaveType', model: 'LeaveType', select: 'name color category' }
  ]);
  return { timezone, events: days.map((day) => ({ ...day, dateKey: instantToDateOnlyKey(day.date, timezone), pending: PENDING_STATUSES.includes(day.request.status) })) };
}
