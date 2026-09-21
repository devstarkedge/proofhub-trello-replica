import asyncHandler from '../../middleware/asyncHandler.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { recordAuditLog } from '../permissions/auditLogService.js';
import * as attendanceHooks from '../attendance/attendanceHooks.js';
import {
  listOverrides, getOverrideHistory, getOverrideById, createOverride, updateOverride, deactivateOverride, resolveAffectedUserIds,
  listScheduleRules, createScheduleRule, deactivateScheduleRule, listDateOverrides, createDateOverrides, deactivateDateOverride
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

// ─── Schedule rules ─────────────────────────────────────────────────────────

export const listRules = asyncHandler(async (req, res) => {
  const rules = await listScheduleRules({ workspaceId: req.workspaceId, overrideId: req.params.overrideId });
  res.json({ success: true, data: rules });
});

export const createRule = asyncHandler(async (req, res) => {
  const { dayOfWeek, occurrence, mode } = req.body;
  const rule = await createScheduleRule({ workspaceId: req.workspaceId, overrideId: req.params.overrideId, dayOfWeek, occurrence, mode, createdBy: req.user.id });
  const parent = await getOverrideById({ workspaceId: req.workspaceId, overrideId: req.params.overrideId });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_WORK_MODE_SCHEDULE_RULE_CREATED', targetType: 'AttendanceWorkModeScheduleRule', targetId: rule._id,
    resourceLabel: 'Work Mode Schedule Rule', summary: `${req.user.name} added a schedule rule to a work mode override`,
    before: null, after: rule.toObject(), category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  if (parent) await notifyAffected(req.workspaceId, parent.scopeType, parent.scopeId);
  res.status(201).json({ success: true, data: rule });
});

export const deactivateRule = asyncHandler(async (req, res) => {
  const rule = await deactivateScheduleRule({ workspaceId: req.workspaceId, ruleId: req.params.ruleId });
  const parent = await getOverrideById({ workspaceId: req.workspaceId, overrideId: rule.override });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_WORK_MODE_SCHEDULE_RULE_DEACTIVATED', targetType: 'AttendanceWorkModeScheduleRule', targetId: rule._id,
    resourceLabel: 'Work Mode Schedule Rule', summary: `${req.user.name} removed a schedule rule from a work mode override`,
    before: null, after: null, category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  if (parent) await notifyAffected(req.workspaceId, parent.scopeType, parent.scopeId);
  res.json({ success: true, data: rule });
});

// ─── Date overrides ─────────────────────────────────────────────────────────

export const listDateOverridesForOverride = asyncHandler(async (req, res) => {
  const rows = await listDateOverrides({ workspaceId: req.workspaceId, overrideId: req.params.overrideId });
  res.json({ success: true, data: rows });
});

export const createDateOverridesForOverride = asyncHandler(async (req, res) => {
  const { startDate, endDate, mode } = req.body;
  if (!startDate) throw new ErrorResponse('startDate is required', 400);
  const rows = await createDateOverrides({ workspaceId: req.workspaceId, overrideId: req.params.overrideId, startDate, endDate, mode, createdBy: req.user.id });
  const parent = await getOverrideById({ workspaceId: req.workspaceId, overrideId: req.params.overrideId });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_WORK_MODE_DATE_OVERRIDE_CREATED', targetType: 'AttendanceWorkModeDateOverride', targetId: rows[0]?._id,
    resourceLabel: 'Work Mode Date Override', summary: `${req.user.name} added ${rows.length} date override(s) to a work mode override`,
    before: null, after: { count: rows.length, mode }, category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  if (parent) await notifyAffected(req.workspaceId, parent.scopeType, parent.scopeId);
  res.status(201).json({ success: true, data: rows });
});

export const deactivateDateOverrideForOverride = asyncHandler(async (req, res) => {
  const row = await deactivateDateOverride({ workspaceId: req.workspaceId, dateOverrideId: req.params.dateOverrideId });
  const parent = await getOverrideById({ workspaceId: req.workspaceId, overrideId: row.override });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_WORK_MODE_DATE_OVERRIDE_DEACTIVATED', targetType: 'AttendanceWorkModeDateOverride', targetId: row._id,
    resourceLabel: 'Work Mode Date Override', summary: `${req.user.name} removed a date override from a work mode override`,
    before: null, after: null, category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  if (parent) await notifyAffected(req.workspaceId, parent.scopeType, parent.scopeId);
  res.json({ success: true, data: row });
});
