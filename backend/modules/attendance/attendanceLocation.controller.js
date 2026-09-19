import asyncHandler from '../../middleware/asyncHandler.js';
import { recordAuditLog } from '../permissions/auditLogService.js';
import * as locationService from './attendanceLocation.service.js';

// Precise coordinates never enter the audit trail's plain-text summary or
// broad-visibility fields (spec §57) — only the structured `after`
// snapshot (permission-gated to view_audit) carries them.
function locationAuditSnapshot(location) {
  return { name: location.name, type: location.type, allowedRadiusMeters: location.allowedRadiusMeters, active: location.active };
}

export const listLocations = asyncHandler(async (req, res) => {
  const locations = await locationService.listLocations({ workspaceId: req.workspaceId, includeInactive: req.query.includeInactive === 'true' });
  res.json({ success: true, data: locations });
});

export const createLocation = asyncHandler(async (req, res) => {
  const { name, type, latitude, longitude, allowedRadiusMeters } = req.body;
  const location = await locationService.createLocation({
    workspaceId: req.workspaceId, name, type, latitude, longitude, allowedRadiusMeters, createdBy: req.user.id
  });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_LOCATION_CREATED', targetType: 'AttendanceLocation', targetId: location._id,
    resourceLabel: `Attendance Location: ${location.name}`, summary: `${req.user.name} added attendance location "${location.name}"`,
    before: null, after: locationAuditSnapshot(location), category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  res.status(201).json({ success: true, data: location });
});

export const updateLocation = asyncHandler(async (req, res) => {
  const location = await locationService.updateLocation({ workspaceId: req.workspaceId, locationId: req.params.locationId, updates: req.body, updatedBy: req.user.id });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_LOCATION_UPDATED', targetType: 'AttendanceLocation', targetId: location._id,
    resourceLabel: `Attendance Location: ${location.name}`, summary: `${req.user.name} updated attendance location "${location.name}"`,
    before: null, after: locationAuditSnapshot(location), category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  res.json({ success: true, data: location });
});

export const deactivateLocation = asyncHandler(async (req, res) => {
  const location = await locationService.deactivateLocation({ workspaceId: req.workspaceId, locationId: req.params.locationId, updatedBy: req.user.id });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_LOCATION_DEACTIVATED', targetType: 'AttendanceLocation', targetId: location._id,
    resourceLabel: `Attendance Location: ${location.name}`, summary: `${req.user.name} deactivated attendance location "${location.name}"`,
    before: null, after: null, category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  res.json({ success: true, data: location });
});

export const listLocationAssignments = asyncHandler(async (req, res) => {
  const assignments = await locationService.listLocationAssignments({ workspaceId: req.workspaceId });
  res.json({ success: true, data: assignments });
});

export const createLocationAssignment = asyncHandler(async (req, res) => {
  const assignment = await locationService.createLocationAssignment({ workspaceId: req.workspaceId, ...req.body, createdBy: req.user.id });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_LOCATION_ASSIGNED', targetType: 'AttendanceLocationAssignment', targetId: assignment._id,
    resourceLabel: 'Attendance Location Assignment', summary: `${req.user.name} created a location assignment`,
    before: null, after: assignment.toObject(), category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  res.status(201).json({ success: true, data: assignment });
});

export const removeLocationAssignment = asyncHandler(async (req, res) => {
  const assignment = await locationService.removeLocationAssignment({ workspaceId: req.workspaceId, assignmentId: req.params.assignmentId });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_LOCATION_ASSIGNMENT_REMOVED', targetType: 'AttendanceLocationAssignment', targetId: assignment._id,
    resourceLabel: 'Attendance Location Assignment', summary: `${req.user.name} removed a location assignment`,
    before: null, after: null, category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  res.json({ success: true, data: assignment });
});
