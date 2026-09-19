import asyncHandler from '../../middleware/asyncHandler.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { recordAuditLog } from '../permissions/auditLogService.js';
import * as attendanceHooks from '../attendance/attendanceHooks.js';
import {
  listOverrides, getOverrideHistory, getOverrideById, createOverride, updateOverride, deactivateOverride, resolveAffectedUserIds
} from './attendanceWorkModeOverride.service.js';

export const list = asyncHandler(async (req, res) => {
  const overrides = await listOverrides({ workspaceId: req.workspaceId });
  res.json({ success: true, data: overrides });
});

export const history = asyncHandler(async (req, res) => {
  const { scopeType, scopeId } = req.query;
  if (!scopeType) throw new ErrorResponse('scopeType is required', 400);
  const rows = await getOverrideHistory({ workspaceId: req.workspaceId, scopeType, scopeId: scopeId || null });
  res.json({ success: true, data: rows });
});

async function notifyAffected(workspaceId, scopeType, scopeId) {
  try {
    const affectedUserIds = await resolveAffectedUserIds({ workspaceId, scopeType, scopeId });
    attendanceHooks.onWorkModeOverrideUpdated(affectedUserIds);
  } catch (error) {
    console.error('[Attendance] work mode override realtime hook error:', error.message);
  }
}

export const create = asyncHandler(async (req, res) => {
  const { scopeType, scopeId, allowedModes, defaultMode, priority, effectiveFrom, effectiveUntil } = req.body;
  const override = await createOverride({
    workspaceId: req.workspaceId, scopeType, scopeId, allowedModes, defaultMode, priority, effectiveFrom, effectiveUntil, createdBy: req.user.id
  });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_WORK_MODE_OVERRIDE_CREATED', targetType: 'AttendanceWorkModeOverride', targetId: override._id,
    resourceLabel: `Work Mode Override: ${scopeType}`, summary: `${req.user.name} created a ${scopeType.toLowerCase()} work mode override`,
    before: null, after: override.toObject(), category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  await notifyAffected(req.workspaceId, override.scopeType, override.scopeId);
  res.status(201).json({ success: true, data: override });
});

export const update = asyncHandler(async (req, res) => {
  const before = await getOverrideById({ workspaceId: req.workspaceId, overrideId: req.params.overrideId });
  const override = await updateOverride({ workspaceId: req.workspaceId, overrideId: req.params.overrideId, updates: req.body, updatedBy: req.user.id });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_WORK_MODE_OVERRIDE_UPDATED', targetType: 'AttendanceWorkModeOverride', targetId: override._id,
    resourceLabel: `Work Mode Override: ${override.scopeType}`, summary: `${req.user.name} updated a ${override.scopeType.toLowerCase()} work mode override`,
    before, after: override.toObject(), category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  await notifyAffected(req.workspaceId, override.scopeType, override.scopeId);
  res.json({ success: true, data: override });
});

export const deactivate = asyncHandler(async (req, res) => {
  const override = await deactivateOverride({ workspaceId: req.workspaceId, overrideId: req.params.overrideId, updatedBy: req.user.id });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_WORK_MODE_OVERRIDE_DEACTIVATED', targetType: 'AttendanceWorkModeOverride', targetId: override._id,
    resourceLabel: `Work Mode Override: ${override.scopeType}`, summary: `${req.user.name} deactivated a ${override.scopeType.toLowerCase()} work mode override`,
    before: null, after: null, category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  await notifyAffected(req.workspaceId, override.scopeType, override.scopeId);
  res.json({ success: true, data: override });
});
