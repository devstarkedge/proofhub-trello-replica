import LeaveRequest from './leaveRequest.model.js';
import LeaveApproval from './leaveApproval.model.js';
import LeaveType from './leaveType.model.js';
import { getBalanceSummary } from './leaveBalance.service.js';

/** Per-leave-type Earned/Consumed/Reserved/Expired/Available for one employee. */
export async function getEmployeeUsageReport({ workspaceId, userId }) {
  const leaveTypes = await LeaveType.find({ isActive: true }).lean();
  const rows = [];
  for (const leaveType of leaveTypes) {
    const summary = await getBalanceSummary({ workspaceId, user: userId, leaveType: leaveType._id });
    rows.push({ leaveType: { id: leaveType._id, name: leaveType.name, category: leaveType.category }, ...summary });
  }
  return rows;
}

/** Requests overlapping [startDate, endDate], grouped by leave type + status — the department-usage/monthly-trend base. */
export async function getUsageBreakdown({ departmentIds = [], startDate, endDate }) {
  const match = { startDate: { $lte: new Date(endDate) }, endDate: { $gte: new Date(startDate) } };
  if (departmentIds.length) match.requesterDepartmentIds = { $in: departmentIds };

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
export async function getMonthlyTrends({ startDate, endDate }) {
  return LeaveRequest.aggregate([
    { $match: { createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } } },
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
export async function getApprovalTurnaround({ startDate, endDate }) {
  const decided = await LeaveApproval.find({
    status: { $in: ['APPROVED', 'REJECTED'] },
    decidedAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
  }).populate('request', 'createdAt').lean();

  const turnaroundHours = decided
    .filter((approval) => approval.request?.createdAt)
    .map((approval) => (new Date(approval.decidedAt) - new Date(approval.request.createdAt)) / (1000 * 60 * 60));

  const averageTurnaroundHours = turnaroundHours.length
    ? Math.round((turnaroundHours.reduce((sum, hours) => sum + hours, 0) / turnaroundHours.length) * 10) / 10
    : 0;
  const pendingBacklog = await LeaveApproval.countDocuments({ status: 'PENDING' });

  return { averageTurnaroundHours, decidedCount: decided.length, pendingBacklog };
}
