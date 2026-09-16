import asyncHandler from '../../middleware/asyncHandler.js';
import Workspace from '../../models/Workspace.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import LeaveRequest from './leaveRequest.model.js';
import LeaveApproval from './leaveApproval.model.js';
import LeavePolicy from './leavePolicy.model.js';
import { getFullBalanceBreakdown } from './leaveBalance.service.js';
import { getManagedDepartmentIds, getManagedEmployeeIds } from './leaveAuthorization.service.js';
import { getDayStatusForUsers } from './leaveDayStatus.service.js';
import { canViewUserLeaveData } from './leaveAuthorization.service.js';
import { getWorkspaceTimezone, instantToDateOnlyKey } from './leaveTimezone.util.js';

const ACTIVE_PENDING_STATUSES = ['PENDING_APPROVAL', 'PARTIALLY_APPROVED'];
const CLOSED_STATUSES = ['APPROVED', 'REJECTED', 'CANCELLED_BY_REQUESTER', 'CANCELLED_BY_HR', 'CANCELLED_BY_ADMIN', 'EXPIRED'];

async function getTodayKey(workspaceId) {
  const workspace = await Workspace.findById(workspaceId).select('timezone').lean();
  return instantToDateOnlyKey(new Date(), getWorkspaceTimezone(workspace));
}

export const getEmployeeDashboard = asyncHandler(async (req, res) => {
  const { workspaceId } = req;
  const userId = req.user.id;

  const [balances, pendingRequests, upcomingApprovedLeaves, history] = await Promise.all([
    getFullBalanceBreakdown({ workspaceId, user: userId }),
    LeaveRequest.find({ workspaceId, requester: userId, status: { $in: ACTIVE_PENDING_STATUSES } })
      .populate('leaveType', 'name color').sort({ createdAt: -1 }).lean(),
    LeaveRequest.find({ workspaceId, requester: userId, status: 'APPROVED', endDate: { $gte: new Date() } })
      .populate('leaveType', 'name color').sort({ startDate: 1 }).lean(),
    LeaveRequest.find({ workspaceId, requester: userId, status: { $in: CLOSED_STATUSES } })
      .populate('leaveType', 'name color').sort({ createdAt: -1 }).limit(20).lean()
  ]);

  res.json({ success: true, data: { balances, pendingRequests, upcomingApprovedLeaves, history } });
});

export const getManagerDashboard = asyncHandler(async (req, res) => {
  const { workspaceId } = req;
  const managerId = req.user.id;

  const departmentIds = await getManagedDepartmentIds({ workspaceId, managerId });
  const employeeIds = await getManagedEmployeeIds({ workspaceId, managerId });
  const todayKey = await getTodayKey(workspaceId);

  const [myBalances, pendingApprovals, teamOnLeaveToday, teamPendingRequests] = await Promise.all([
    getFullBalanceBreakdown({ workspaceId, user: managerId }),
    LeaveApproval.find({ workspaceId, level: 'DEPARTMENT_MANAGER', status: 'PENDING', eligibleApproverUserIds: managerId })
      .populate({ path: 'request', populate: [{ path: 'requester', select: 'name email avatar' }, { path: 'leaveType', select: 'name color' }] })
      .lean(),
    employeeIds.length
      ? getDayStatusForUsers({ workspaceId, userIds: employeeIds, startDate: todayKey, endDate: todayKey, visibility: 'department' })
      : {},
    departmentIds.length
      ? LeaveRequest.find({ workspaceId, requesterDepartmentIds: { $in: departmentIds }, status: { $in: ACTIVE_PENDING_STATUSES } })
          .populate('requester', 'name email avatar').populate('leaveType', 'name color').sort({ createdAt: -1 }).lean()
      : []
  ]);

  res.json({ success: true, data: { departmentIds, myBalances, pendingApprovals, teamOnLeaveToday, teamPendingRequests } });
});

async function buildWorkspaceWideDashboard(workspaceId) {
  const todayKey = await getTodayKey(workspaceId);
  const activeMembers = await WorkspaceMembership.find({ workspace: workspaceId, status: 'active' }).select('user').lean();
  const memberIds = activeMembers.map((member) => member.user);

  const [pendingApprovals, pendingCount, approvedCount, rejectedCount, cancelledCount, policies, everyoneOnLeaveToday] = await Promise.all([
    LeaveApproval.find({ workspaceId, level: { $in: ['HR', 'ADMIN'] }, status: 'PENDING' })
      .populate({ path: 'request', populate: [{ path: 'requester', select: 'name email avatar' }, { path: 'leaveType', select: 'name color' }] })
      .lean(),
    LeaveRequest.countDocuments({ workspaceId, status: { $in: ACTIVE_PENDING_STATUSES } }),
    LeaveRequest.countDocuments({ workspaceId, status: 'APPROVED' }),
    LeaveRequest.countDocuments({ workspaceId, status: 'REJECTED' }),
    LeaveRequest.countDocuments({ workspaceId, status: { $in: ['CANCELLED_BY_REQUESTER', 'CANCELLED_BY_HR', 'CANCELLED_BY_ADMIN'] } }),
    LeavePolicy.find({ status: { $ne: 'archived' } }).select('name status isDefault').lean(),
    memberIds.length
      ? getDayStatusForUsers({ workspaceId, userIds: memberIds, startDate: todayKey, endDate: todayKey, visibility: 'workspace' })
      : {}
  ]);

  const onLeaveTodayCount = Object.values(everyoneOnLeaveToday).filter((byDate) => byDate[todayKey]?.status === 'ON_LEAVE').length;

  return {
    summary: { pendingCount, approvedCount, rejectedCount, cancelledCount, onLeaveTodayCount, totalMembers: memberIds.length },
    pendingApprovals, policies
  };
}

export const getHrDashboard = asyncHandler(async (req, res) => {
  const data = await buildWorkspaceWideDashboard(req.workspaceId);
  res.json({ success: true, data });
});

export const getAdminDashboard = asyncHandler(async (req, res) => {
  const data = await buildWorkspaceWideDashboard(req.workspaceId);
  res.json({ success: true, data });
});

export const getDayStatus = asyncHandler(async (req, res) => {
  const { userIds, startDate, endDate, visibility } = req.query;
  const requestedIds = String(userIds || '').split(',').filter(Boolean);
  if (!requestedIds.length || !startDate || !endDate) {
    return res.json({ success: true, data: {} });
  }

  // canViewUserLeaveData already encodes Employee-self/Manager-department/
  // HR-or-Admin-workspace-wide visibility — never trust a caller-supplied
  // user-id list without re-checking it here, since this endpoint backs a
  // Teams-page grid an ordinary Employee can also load.
  const allowedIds = [];
  for (const id of requestedIds) {
    if (await canViewUserLeaveData({ viewer: req.user, targetUserId: id, workspaceId: req.workspaceId })) {
      allowedIds.push(id);
    }
  }
  if (!allowedIds.length) return res.json({ success: true, data: {} });

  const data = await getDayStatusForUsers({
    workspaceId: req.workspaceId, userIds: allowedIds, startDate, endDate,
    visibility: visibility === 'approved_only' ? 'approved_only' : 'department'
  });
  res.json({ success: true, data });
});
