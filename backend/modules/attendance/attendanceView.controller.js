import asyncHandler from '../../middleware/asyncHandler.js';
import { resolveAttendanceAccess } from './attendanceAuthorization.service.js';
import { getAttendanceView, getAttendanceDashboardSummary, getAttendanceSessionDetail } from './attendanceView.service.js';

/** GET /api/attendance/access — the current viewer's resolved scope/permissions, so the frontend renders nav/filters from real backend authorization instead of branching on a role string. */
export const getAccess = asyncHandler(async (req, res) => {
  const access = await resolveAttendanceAccess({ viewer: req.user, workspaceId: req.workspaceId });
  res.json({ success: true, data: access });
});

export const getView = asyncHandler(async (req, res) => {
  const { startDate, endDate, userId, departmentId, status, workMode } = req.query;
  const result = await getAttendanceView({
    viewer: req.user, workspaceId: req.workspaceId,
    startDate: startDate || null, endDate: endDate || null,
    userId: userId || null, departmentId: departmentId || null, status: status || null, workMode: workMode || null
  });
  res.json({ success: true, data: result.records, scope: result.scope });
});

export const getDashboard = asyncHandler(async (req, res) => {
  const { startDate, endDate, departmentId } = req.query;
  const result = await getAttendanceDashboardSummary({
    viewer: req.user, workspaceId: req.workspaceId,
    startDate: startDate || null, endDate: endDate || null, departmentId: departmentId || null
  });
  res.json({ success: true, data: result });
});

export const getSessionDetail = asyncHandler(async (req, res) => {
  const session = await getAttendanceSessionDetail({ viewer: req.user, workspaceId: req.workspaceId, sessionId: req.params.sessionId });
  res.json({ success: true, data: session });
});
