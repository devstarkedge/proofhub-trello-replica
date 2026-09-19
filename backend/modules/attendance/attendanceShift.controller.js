import asyncHandler from '../../middleware/asyncHandler.js';
import { recordAuditLog } from '../permissions/auditLogService.js';
import * as shiftService from './attendanceShift.service.js';

export const listShifts = asyncHandler(async (req, res) => {
  const shifts = await shiftService.listShifts({ workspaceId: req.workspaceId, includeInactive: req.query.includeInactive === 'true' });
  res.json({ success: true, data: shifts });
});

export const createShift = asyncHandler(async (req, res) => {
  const shift = await shiftService.createShift({ workspaceId: req.workspaceId, ...req.body, createdBy: req.user.id });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_SHIFT_CREATED', targetType: 'AttendanceShift', targetId: shift._id,
    resourceLabel: `Attendance Shift: ${shift.name}`, summary: `${req.user.name} created shift "${shift.name}"`,
    before: null, after: shift.toObject(), category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  res.status(201).json({ success: true, data: shift });
});

export const updateShift = asyncHandler(async (req, res) => {
  const shift = await shiftService.updateShift({ workspaceId: req.workspaceId, shiftId: req.params.shiftId, updates: req.body });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_SHIFT_UPDATED', targetType: 'AttendanceShift', targetId: shift._id,
    resourceLabel: `Attendance Shift: ${shift.name}`, summary: `${req.user.name} updated shift "${shift.name}"`,
    before: null, after: shift.toObject(), category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  res.json({ success: true, data: shift });
});

export const deactivateShift = asyncHandler(async (req, res) => {
  const shift = await shiftService.deactivateShift({ workspaceId: req.workspaceId, shiftId: req.params.shiftId });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_SHIFT_DEACTIVATED', targetType: 'AttendanceShift', targetId: shift._id,
    resourceLabel: `Attendance Shift: ${shift.name}`, summary: `${req.user.name} deactivated shift "${shift.name}"`,
    before: null, after: null, category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  res.json({ success: true, data: shift });
});

export const listShiftAssignments = asyncHandler(async (req, res) => {
  const assignments = await shiftService.listShiftAssignments({ workspaceId: req.workspaceId });
  res.json({ success: true, data: assignments });
});

export const createShiftAssignment = asyncHandler(async (req, res) => {
  const assignment = await shiftService.createShiftAssignment({ workspaceId: req.workspaceId, ...req.body, createdBy: req.user.id });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_SHIFT_ASSIGNED', targetType: 'AttendanceShiftAssignment', targetId: assignment._id,
    resourceLabel: 'Attendance Shift Assignment', summary: `${req.user.name} created a shift assignment`,
    before: null, after: assignment.toObject(), category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  res.status(201).json({ success: true, data: assignment });
});

export const removeShiftAssignment = asyncHandler(async (req, res) => {
  const assignment = await shiftService.removeShiftAssignment({ workspaceId: req.workspaceId, assignmentId: req.params.assignmentId });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_SHIFT_ASSIGNMENT_REMOVED', targetType: 'AttendanceShiftAssignment', targetId: assignment._id,
    resourceLabel: 'Attendance Shift Assignment', summary: `${req.user.name} removed a shift assignment`,
    before: null, after: null, category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  res.json({ success: true, data: assignment });
});
