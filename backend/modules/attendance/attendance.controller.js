import asyncHandler from '../../middleware/asyncHandler.js';
import Workspace from '../../models/Workspace.js';
import { recordAuditLog } from '../permissions/auditLogService.js';
import { getTodayStatus, checkIn, checkOut } from './attendance.service.js';
import { setupAttendanceModule } from './attendanceSetup.service.js';

/**
 * `req.user` already carries the active-workspace membership's role/
 * department flattened onto it (see authMiddleware.js) — protect() would
 * have already rejected the request if that membership weren't active, so
 * reconstructing this shape here needs no extra query.
 */
function membershipFromReq(req) {
  return { role: req.user.role, department: req.user.department, status: 'active' };
}

/** attendance.service.js needs the real Workspace doc (attendanceModuleEnabled + timezone), not just the bare id protect() attaches. */
async function loadWorkspace(req) {
  return Workspace.findById(req.workspaceId).select('attendanceModuleEnabled timezone').lean();
}

export const setup = asyncHandler(async (req, res) => {
  const result = await setupAttendanceModule({ workspaceId: req.workspaceId });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_MODULE_SETUP', targetType: 'Workspace', targetId: req.workspaceId,
    resourceLabel: 'Attendance Module Setup', summary: `${req.user.name} enabled the Attendance module for this workspace`,
    before: null, after: result, category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  res.json({ success: true, data: result });
});

export const getMyTodayStatus = asyncHandler(async (req, res) => {
  const workspace = await loadWorkspace(req);
  const status = await getTodayStatus({
    workspaceId: req.workspaceId, userId: req.user.id, membership: membershipFromReq(req), workspace
  });
  res.json({ success: true, data: status });
});

export const postCheckIn = asyncHandler(async (req, res) => {
  const { coordinates, reportedAccuracyMeters, capturedAt, requestedWorkMode } = req.body || {};
  const gps = coordinates ? { coordinates, reportedAccuracyMeters, capturedAt: capturedAt ? new Date(capturedAt) : new Date() } : null;
  const idempotencyKey = req.body?.idempotencyKey || req.get('Idempotency-Key') || null;
  const workspace = await loadWorkspace(req);

  const result = await checkIn({
    workspaceId: req.workspaceId, userId: req.user.id, membership: membershipFromReq(req),
    workspace, gps, idempotencyKey, ipAddress: req.ip, requestedWorkMode: requestedWorkMode || null
  });

  if (!result.replay) {
    await recordAuditLog({
      actor: req.user, action: 'ATTENDANCE_CHECKED_IN', targetType: 'AttendanceSession', targetId: result.session._id,
      resourceLabel: `Attendance check-in: ${req.user.name}`, summary: `${req.user.name} checked in`,
      before: null, after: { workMode: result.session.checkIn.workMode, workDateKey: result.session.workDateKey },
      category: 'attendance_management', meta: { workspaceId: req.workspaceId }
    });
  }
  res.status(result.replay ? 200 : 201).json({ success: true, data: result.session, replay: result.replay });
});

export const postCheckOut = asyncHandler(async (req, res) => {
  const { coordinates, reportedAccuracyMeters, capturedAt } = req.body || {};
  const gps = coordinates ? { coordinates, reportedAccuracyMeters, capturedAt: capturedAt ? new Date(capturedAt) : new Date() } : null;
  const workspace = await loadWorkspace(req);

  const result = await checkOut({
    workspaceId: req.workspaceId, userId: req.user.id, membership: membershipFromReq(req),
    workspace, gps, ipAddress: req.ip
  });

  if (!result.replay) {
    await recordAuditLog({
      actor: req.user, action: 'ATTENDANCE_CHECKED_OUT', targetType: 'AttendanceSession', targetId: result.session._id,
      resourceLabel: `Attendance check-out: ${req.user.name}`, summary: `${req.user.name} checked out`,
      before: null, after: { workDateKey: result.session.workDateKey, checkOutAt: result.session.checkOutAt },
      category: 'attendance_management', meta: { workspaceId: req.workspaceId }
    });
  }
  res.json({ success: true, data: result.session, replay: result.replay });
});
