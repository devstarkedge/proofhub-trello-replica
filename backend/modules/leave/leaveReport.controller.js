import asyncHandler from '../../middleware/asyncHandler.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import * as leaveReportService from './leaveReport.service.js';
import { canViewUserLeaveData, getManagedDepartmentIds } from './leaveAuthorization.service.js';
import { hasResourceAction } from '../permissions/permissionEngine.js';

export const getEmployeeUsageReport = asyncHandler(async (req, res) => {
  const targetUserId = req.params.userId || req.user.id;
  const allowed = await canViewUserLeaveData({ viewer: req.user, targetUserId, workspaceId: req.workspaceId });
  if (!allowed) throw new ErrorResponse('You do not have permission to view this report', 403);
  const data = await leaveReportService.getEmployeeUsageReport({ workspaceId: req.workspaceId, userId: targetUserId });
  res.json({ success: true, data });
});

/**
 * Department-scoped usage — visibility mirrors the dashboard/balance rules
 * rather than a single permission gate, since a Manager must see their own
 * department's report structurally (Department.managers), the same way
 * they see their department's dashboard, without needing an Admin-granted
 * override for it.
 */
export const getDepartmentUsageReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, departmentId } = req.query;
  if (!startDate || !endDate) throw new ErrorResponse('startDate and endDate are required', 400);

  let departmentIds;
  if (req.user.role === 'admin') {
    departmentIds = departmentId ? [departmentId] : [];
  } else if (req.user.role === 'manager') {
    const managed = await getManagedDepartmentIds({ workspaceId: req.workspaceId, managerId: req.user.id });
    departmentIds = departmentId ? managed.filter((id) => String(id) === String(departmentId)) : managed;
    if (!departmentIds.length) throw new ErrorResponse('You do not manage this department', 403);
  } else if (req.user.role === 'hr' && await hasResourceAction(req.user, 'leave', 'view_reports', req.workspaceId)) {
    departmentIds = departmentId ? [departmentId] : [];
  } else {
    throw new ErrorResponse('You do not have permission to view this report', 403);
  }

  const data = await leaveReportService.getUsageBreakdown({ departmentIds, startDate, endDate });
  res.json({ success: true, data });
});

export const getMonthlyTrends = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) throw new ErrorResponse('startDate and endDate are required', 400);
  const data = await leaveReportService.getMonthlyTrends({ startDate, endDate });
  res.json({ success: true, data });
});

export const getApprovalTurnaround = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) throw new ErrorResponse('startDate and endDate are required', 400);
  const data = await leaveReportService.getApprovalTurnaround({ startDate, endDate });
  res.json({ success: true, data });
});
