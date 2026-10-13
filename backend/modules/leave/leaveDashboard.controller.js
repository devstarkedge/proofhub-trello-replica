import asyncHandler from '../../middleware/asyncHandler.js';
import mongoose from 'mongoose';
import { validateDateRange } from '../../utils/calendarDateRange.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import Workspace from '../../models/Workspace.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import LeaveRequest from './leaveRequest.model.js';
import LeaveApproval from './leaveApproval.model.js';
import LeavePolicy from './leavePolicy.model.js';
import { getFullBalanceBreakdown } from './leaveBalance.service.js';
import { getLeaveDashboardScope } from './leaveAuthorization.service.js';
import { getDayStatusForUsers } from './leaveDayStatus.service.js';
import { resolveLeaveAccessScope, assertMyLeaveSelfServiceAllowed } from './leaveAuthorization.service.js';
import { getWorkspaceTimezone, instantToDateOnlyKey } from './leaveTimezone.util.js';
import { getLeaveDashboardRecords, PENDING_STATUSES, APPROVED_STATUSES, CANCELLED_STATUSES } from './leaveRead.service.js';
import { queryLeaveRequests, queryLeaveSummary } from './leaveRequestQuery.service.js';

const compatibleQueue = (requests) => requests.map((request) => ({ _id: request._id, request, level: request.actions.approvals[0]?.level, stages: request.approvals, actions: request.actions }));

export const getRecords = asyncHandler(async (req, res) => {
  const data = await getLeaveDashboardRecords({ ...req.query, viewer: req.user, workspaceId: req.workspaceId });
  res.json({ success: true, data });
});
export const getSummary = asyncHandler(async (req, res) => {
  const data = await queryLeaveSummary({ viewer: req.user, workspaceId: req.workspaceId });
  res.json({ success: true, data });
});

const ACTIVE_PENDING_STATUSES = PENDING_STATUSES;
const CLOSED_STATUSES = [...APPROVED_STATUSES, 'REJECTED', ...CANCELLED_STATUSES, 'EXPIRED'];

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
    LeaveRequest.find({ workspaceId, requester: userId, status: { $in: APPROVED_STATUSES }, endDate: { $gte: new Date() } })
      .populate('leaveType', 'name color').sort({ startDate: 1 }).lean(),
    LeaveRequest.find({ workspaceId, requester: userId, status: { $in: CLOSED_STATUSES } })
      .populate('leaveType', 'name color').sort({ createdAt: -1 }).limit(20).lean()
  ]);

  res.json({ success: true, data: { balances, pendingRequests, upcomingApprovedLeaves, history } });
});

export const getManagerDashboard = asyncHandler(async (req, res) => {
  const { workspaceId } = req;
  const managerId = req.user.id;

  const visibility = await resolveLeaveAccessScope({ viewer: req.user, workspaceId, includeEmployees: true });
  const { departmentIds, employeeIds, requestFilter: requestScope } = visibility;
  const todayKey = await getTodayKey(workspaceId);
  // Department.managers/members are plain User references with no role
  // restriction, so employeeIds/departmentIds already include any
  // custom-role user assigned to (or managing) this department — no
  // separate custom-role handling needed for the queries below.

  const [
    myBalances, pendingApprovals, teamOnLeaveToday, teamPendingRequests,
    upcomingApprovedLeave
  ] = await Promise.all([
    getFullBalanceBreakdown({ workspaceId, user: managerId }),
    queryLeaveRequests({ workspaceId, viewer: req.user, view: 'approval', includeSummary: false }).then((result) => compatibleQueue(result.requests)),
    employeeIds.length
      ? getDayStatusForUsers({ workspaceId, userIds: employeeIds, startDate: todayKey, endDate: todayKey, visibility: 'department', requestScope })
      : {},
    departmentIds.length
      ? LeaveRequest.find({ ...requestScope, status: { $in: ACTIVE_PENDING_STATUSES } })
          .populate('requester', 'name email avatar').populate('leaveType', 'name color').sort({ createdAt: -1 }).lean()
      : [],
    departmentIds.length
      ? LeaveRequest.find({ ...requestScope, status: { $in: APPROVED_STATUSES }, endDate: { $gte: new Date() } })
          .populate('requester', 'name email avatar').populate('leaveType', 'name color').sort({ startDate: 1 }).lean()
      : [],

  ]);

  const consistent = await queryLeaveSummary({ viewer: req.user, workspaceId, visibility });

  res.json({
    success: true,
    data: {
      departmentIds, myBalances, pendingApprovals, teamOnLeaveToday, teamPendingRequests, upcomingApprovedLeave,
      summary: {
        pendingCount: consistent.summary.pending, approvedCount: consistent.summary.approved, rejectedCount: consistent.summary.rejected, cancelledCount: consistent.summary.cancelled,
        onLeaveTodayCount: consistent.summary.today, teamSize: employeeIds.length
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

async function buildWorkspaceWideDashboard(workspaceId, user) {
  const userId = user.id || user._id;
  const activeMembers = await WorkspaceMembership.find({ workspace: workspaceId, status: 'active' }).select('user').lean();
  const memberIds = activeMembers.map((member) => member.user);

  const [pendingApprovals, policies] = await Promise.all([
    queryLeaveRequests({ workspaceId, viewer: user, view: 'approval', includeSummary: false }).then((result) => compatibleQueue(result.requests)),
    LeavePolicy.find({ workspaceId, status: { $ne: 'archived' } }).select('name status isDefault').lean()
  ]);
  const consistent = await queryLeaveSummary({ viewer: user, workspaceId });

  return {
    summary: { pendingCount: consistent.summary.pending, approvedCount: consistent.summary.approved, rejectedCount: consistent.summary.rejected, cancelledCount: consistent.summary.cancelled, onLeaveTodayCount: consistent.summary.today, totalMembers: memberIds.length },
    pendingApprovals, policies
  };
}

export const getHrDashboard = asyncHandler(async (req, res) => {
  const data = await buildWorkspaceWideDashboard(req.workspaceId, req.user);
  res.json({ success: true, data });
});

export const getAdminDashboard = asyncHandler(async (req, res) => {
  const data = await buildWorkspaceWideDashboard(req.workspaceId, req.user);
  res.json({ success: true, data });
});

export const getDayStatus = asyncHandler(async (req, res) => {
  const { userIds, startDate, endDate, visibility } = req.query;
  const requestedIds = [...new Set(String(userIds || '').split(',').filter(Boolean))];
  if (!requestedIds.length || !startDate || !endDate) {
    return res.json({ success: true, data: {} });
  }

  // canViewUserLeaveData already encodes Employee-self/Manager-department/
  // HR-or-Admin-workspace-wide visibility — never trust a caller-supplied
  // user-id list without re-checking it here, since this endpoint backs a
  // Teams-page grid an ordinary Employee can also load.
  if (requestedIds.length > 500 || requestedIds.some((id) => !mongoose.isValidObjectId(id))) throw new ErrorResponse('Select up to 500 valid employees', 400);
  validateDateRange(startDate, endDate, 93);
  const scope = await resolveLeaveAccessScope({ viewer: req.user, workspaceId: req.workspaceId, includeEmployees: true });
  const allowedSet = new Set([String(scope.viewer._id), ...scope.employeeIds.map(String)]);
  const allowedIds = scope.scope === 'workspace' ? requestedIds : requestedIds.filter((id) => allowedSet.has(id));
  if (!allowedIds.length) return res.json({ success: true, data: {} });

  const data = await getDayStatusForUsers({
    workspaceId: req.workspaceId, userIds: allowedIds, startDate, endDate,
    visibility: visibility === 'approved_only' ? 'approved_only' : 'department', includeLeave: req.query.calendarOnly !== 'true',
    requestScope: scope.requestFilter
  });
  res.json({ success: true, data });
});
