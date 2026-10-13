import LeaveRequest from './leaveRequest.model.js';
import mongoose from 'mongoose';
import LeaveApproval from './leaveApproval.model.js';
import { getFullBalanceBreakdown } from './leaveBalance.service.js';
import { getActiveWorkspaceId } from '../workspaces/workspaceContext.js';

/** Per-leave-type Earned/Consumed/Reserved/Expired/Available for one employee. */
export async function getEmployeeUsageReport({ workspaceId, userId }) {
  const breakdown = await getFullBalanceBreakdown({ workspaceId, user: userId });
  return breakdown.map(({ leaveType, earned, consumed, debited, reserved, expired, available }) => ({
    leaveType: { id: leaveType.id, name: leaveType.name, category: leaveType.category }, earned, consumed, debited, reserved, expired, available
  }));
}

/** Requests overlapping [startDate, endDate], grouped by leave type + status — the department-usage/monthly-trend base. */
export async function getUsageBreakdown({ workspaceId = getActiveWorkspaceId(), departmentIds = [], startDate, endDate }) {
  const match = { workspaceId: new mongoose.Types.ObjectId(workspaceId), startDate: { $lte: new Date(endDate) }, endDate: { $gte: new Date(startDate) } };
  if (departmentIds.length) match.requesterDepartmentIds = { $in: departmentIds.map((id) => new mongoose.Types.ObjectId(id)) };

  return LeaveRequest.aggregate([
    { $match: match },
    {
      $group: {
        _id: { leaveType: '$leaveType', status: '$status' },
        totalConsumingDayUnits: { $sum: '$totalConsumingDayUnits' },
        count: { $sum: 1 }
      }
    },
    // $lookup sub-pipelines aren't auto-scoped by workspaceScopePlugin, but
    // this is safe here for the same documented reason Board/Card lookups
    // are: leaveType can only ever reference a LeaveType from this same
    // workspace, correctly scoped at write time (see workspaceScopePlugin.js).
    { $lookup: { from: 'leavetypes', localField: '_id.leaveType', foreignField: '_id', as: 'leaveType' } },
    { $unwind: { path: '$leaveType', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0, status: '$_id.status', totalConsumingDayUnits: 1, count: 1,
        leaveTypeId: '$leaveType._id', leaveTypeName: '$leaveType.name', leaveTypeCategory: '$leaveType.category'
      }
    }
  ]);
}

/** Monthly submitted/approved/rejected/cancelled counts and day totals. */
export async function getMonthlyTrends({ workspaceId = getActiveWorkspaceId(), startDate, endDate }) {
  return LeaveRequest.aggregate([
    { $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId), createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } } },
    {
      $group: {
        _id: { month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, status: '$status' },
        count: { $sum: 1 },
        days: { $sum: '$totalConsumingDayUnits' }
      }
    },
    { $sort: { '_id.month': 1 } },
    { $project: { _id: 0, month: '$_id.month', status: '$_id.status', count: 1, days: 1 } }
  ]);
}

/** Average hours from submission to final decision, and the current pending backlog size. */
export async function getApprovalTurnaround({ workspaceId = getActiveWorkspaceId(), startDate, endDate }) {
  const workspace = new mongoose.Types.ObjectId(workspaceId);
  const [[summary], pendingBacklog] = await Promise.all([
    LeaveApproval.aggregate([
      { $match: { workspaceId: workspace, status: { $in: ['APPROVED', 'REJECTED'] }, decidedAt: { $gte: new Date(startDate), $lte: new Date(endDate) } } },
      { $lookup: { from: LeaveRequest.collection.name, localField: 'request', foreignField: '_id', pipeline: [
        { $match: { workspaceId: workspace } }, { $project: { createdAt: 1 } }
      ], as: '_request' } },
      { $group: { _id: null, decidedCount: { $sum: 1 }, hours: { $avg: { $cond: [
        { $gt: [{ $size: '$_request' }, 0] }, { $divide: [{ $subtract: ['$decidedAt', { $arrayElemAt: ['$_request.createdAt', 0] }] }, 3600000] }, null
      ] } } } }
    ]),
    LeaveApproval.countDocuments({ workspaceId: workspace, status: 'PENDING' })
  ]);
  return { averageTurnaroundHours: Math.round((summary?.hours || 0) * 10) / 10, decidedCount: summary?.decidedCount || 0, pendingBacklog };
}
