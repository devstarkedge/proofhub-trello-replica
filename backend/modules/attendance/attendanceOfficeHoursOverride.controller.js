import asyncHandler from '../../middleware/asyncHandler.js';
import { recordAuditLog } from '../permissions/auditLogService.js';
import * as attendanceHooks from './attendanceHooks.js';
import {
  listOverrides, getOverrideHistory, getOverrideById, createOverride, updateOverride, deactivateOverride, resolveAffectedUserIds
} from './attendanceOfficeHoursOverride.service.js';

export const list = asyncHandler(async (req, res) => {
  const overrides = await listOverrides({ workspaceId: req.workspaceId });
  res.json({ success: true, data: overrides });
});

export const history = asyncHandler(async (req, res) => {
  const { scopeType, scopeId } = req.query;
  const rows = await getOverrideHistory({ workspaceId: req.workspaceId, scopeType, scopeId });
  res.json({ success: true, data: rows });
});

async function notifyAffected(workspaceId, scopeType, scopeId) {
  try {
    const affectedUserIds = await resolveAffectedUserIds({ workspaceId, scopeType, scopeId });
    attendanceHooks.onOfficeHoursOverrideUpdated(affectedUserIds);
  } catch (error) {
    console.error('[Attendance] office hours override realtime hook error:', error.message);
  }
}

const FIELD_KEYS = ['startLocalTime', 'endLocalTime', 'graceMinutes', 'earlyExitGraceMinutes', 'minimumFullDayMinutes', 'minimumHalfDayMinutes'];
const pickFieldsFromBody = (body) => Object.fromEntries(FIELD_KEYS.map((key) => [key, body[key] ?? null]));

export const create = asyncHandler(async (req, res) => {
  const { scopeType, scopeId, priority, effectiveFrom, effectiveUntil } = req.body;
  const override = await createOverride({
    workspaceId: req.workspaceId, scopeType, scopeId, priority, effectiveFrom, effectiveUntil,
    createdBy: req.user.id, ...pickFieldsFromBody(req.body)
  });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_OFFICE_HOURS_OVERRIDE_CREATED', targetType: 'AttendanceOfficeHoursOverride', targetId: override._id,
    resourceLabel: `Office Hours Override: ${scopeType}`, summary: `${req.user.name} created a ${scopeType.toLowerCase()} Office Hours override`,
    before: null, after: override.toObject(), category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  await notifyAffected(req.workspaceId, override.scopeType, override.scopeId);
  res.status(201).json({ success: true, data: override });
});

export const update = asyncHandler(async (req, res) => {
  const before = await getOverrideById({ workspaceId: req.workspaceId, overrideId: req.params.overrideId });
  const override = await updateOverride({ workspaceId: req.workspaceId, overrideId: req.params.overrideId, updates: req.body, updatedBy: req.user.id });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_OFFICE_HOURS_OVERRIDE_UPDATED', targetType: 'AttendanceOfficeHoursOverride', targetId: override._id,
    resourceLabel: `Office Hours Override: ${override.scopeType}`, summary: `${req.user.name} updated a ${override.scopeType.toLowerCase()} Office Hours override`,
    before, after: override.toObject(), category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  await notifyAffected(req.workspaceId, override.scopeType, override.scopeId);
  res.json({ success: true, data: override });
});

export const deactivate = asyncHandler(async (req, res) => {
  const override = await deactivateOverride({ workspaceId: req.workspaceId, overrideId: req.params.overrideId, updatedBy: req.user.id });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_OFFICE_HOURS_OVERRIDE_DEACTIVATED', targetType: 'AttendanceOfficeHoursOverride', targetId: override._id,
    resourceLabel: `Office Hours Override: ${override.scopeType}`, summary: `${req.user.name} deactivated a ${override.scopeType.toLowerCase()} Office Hours override`,
    before: null, after: null, category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  await notifyAffected(req.workspaceId, override.scopeType, override.scopeId);
  res.json({ success: true, data: override });
});
