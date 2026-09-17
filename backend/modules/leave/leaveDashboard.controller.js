import asyncHandler from '../../middleware/asyncHandler.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import Workspace from '../../models/Workspace.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import LeaveRequest from './leaveRequest.model.js';
import LeaveApproval from './leaveApproval.model.js';
import LeavePolicy from './leavePolicy.model.js';
import { getFullBalanceBreakdown } from './leaveBalance.service.js';
import { getManagedDepartmentIds, getManagedEmployeeIds, getLeaveDashboardScope } from './leaveAuthorization.service.js';
import { getDayStatusForUsers } from './leaveDayStatus.service.js';
import { canViewUserLeaveData, assertMyLeaveSelfServiceAllowed } from './leaveAuthorization.service.js';
import { getWorkspaceTimezone, instantToDateOnlyKey } from './leaveTimezone.util.js';

const ACTIVE_PENDING_STATUSES = ['PENDING_APPROVAL', 'PARTIALLY_APPROVED'];
const CLOSED_STATUSES = ['APPROVED', 'REJECTED', 'CANCELLED_BY_REQUESTER', 'CANCELLED_BY_HR', 'CANCELLED_BY_ADMIN', 'EXPIRED'];

async function getTodayKey(workspaceId) {
  const workspace = await Workspace.findById(workspaceId).select('timezone').lean();
  return instantToDateOnlyKey(new Date(), getWorkspaceTimezone(workspace));
}

export const getEmployeeDashboard = asyncHandler(async (req, res) => {
  // Same personal-data category as /balance/me, /requests/mine, etc. — an
  // Admin must not reach their own balance/requests through this route
  // either, since it's what backs the "My Leave"-shaped personal section
  // on the Leave Dashboard for every other role.
  assertMyLeaveSelfServiceAllowed(req.user);

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
  // Department.managers/members are plain User references with no role
  // restriction, so employeeIds/departmentIds already include any
  // custom-role user assigned to (or managing) this department — no
  // separate custom-role handling needed for the queries below.

  const [
    myBalances, pendingApprovals, teamOnLeaveToday, teamPendingRequests,
    upcomingApprovedLeave, approvedCount, rejectedCount, cancelledCount
  ] = await Promise.all([
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
      : [],
    departmentIds.length
      ? LeaveRequest.find({ workspaceId, requesterDepartmentIds: { $in: departmentIds }, status: 'APPROVED', endDate: { $gte: new Date() } })
          .populate('requester', 'name email avatar').populate('leaveType', 'name color').sort({ startDate: 1 }).lean()
      : [],
    departmentIds.length
      ? LeaveRequest.countDocuments({ workspaceId, requesterDepartmentIds: { $in: departmentIds }, status: 'APPROVED' })
      : 0,
    departmentIds.length
      ? LeaveRequest.countDocuments({ workspaceId, requesterDepartmentIds: { $in: departmentIds }, status: 'REJECTED' })
      : 0,
    departmentIds.length
      ? LeaveRequest.countDocuments({ workspaceId, requesterDepartmentIds: { $in: departmentIds }, status: { $in: ['CANCELLED_BY_REQUESTER', 'CANCELLED_BY_HR', 'CANCELLED_BY_ADMIN'] } })
      : 0
  ]);

  const onLeaveTodayCount = Object.values(teamOnLeaveToday).filter((byDate) => byDate[todayKey]?.status === 'ON_LEAVE').length;

  res.json({
    success: true,
    data: {
      departmentIds, myBalances, pendingApprovals, teamOnLeaveToday, teamPendingRequests, upcomingApprovedLeave,
      summary: {
        pendingCount: teamPendingRequests.length, approvedCount, rejectedCount, cancelledCount,
        onLeaveTodayCount, teamSize: employeeIds.length
      }
    }
  });
});

/**
 * The single scope-check the frontend must consult to decide whether to
 * show the Leave Dashboard at all, and which section to render — never a
 * client-side branch on the raw `user.role` string, since a custom role's
 * real entitlement (department-manager membership, or an explicit
 * leave.view_workspace grant) can only be resolved server-side.
 */
export const getDashboardScope = asyncHandler(async (req, res) => {
  const scope = await getLeaveDashboardScope({ user: req.user, workspaceId: req.workspaceId });
  res.json({ success: true, data: scope });
});

/**
 * Rejects outright (403) rather than silently returning empty data — a
 * plain Employee, or a custom role granted neither department-manager
 * membership nor leave.view_workspace, must never reach team/workspace
 * dashboard data via a direct API call even if a UI redirect is bypassed.
 * Self-service (/employee) is intentionally NOT behind this gate — every
 * authenticated member may always see their own leave data.
 */
export const requireLeaveDashboardAccess = asyncHandler(async (req, res, next) => {
  const scope = await getLeaveDashboardScope({ user: req.user, workspaceId: req.workspaceId });
  if (scope.scope === 'none') {
    throw new ErrorResponse('You do not have access to the Leave Dashboard', 403);
  }
  next();
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
