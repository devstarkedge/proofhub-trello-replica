import asyncHandler from '../../middleware/asyncHandler.js';
import { recordAuditLog } from '../permissions/auditLogService.js';
import * as locationService from './attendanceLocation.service.js';
import { resolveAllActiveMemberUserIds } from './attendancePolicy.service.js';
import * as attendanceHooks from './attendanceHooks.js';

// Precise coordinates never enter the audit trail's plain-text summary or
// broad-visibility fields (spec §57) — only the structured `after`
// snapshot (permission-gated to view_audit) carries them.
function locationAuditSnapshot(location) {
  return { name: location.name, type: location.type, allowedRadiusMeters: location.allowedRadiusMeters, active: location.active, deletedAt: location.deletedAt };
}

/** Every location action affects every attendance-eligible workspace member's next check-in — never a broad department/role fan-out risk here, just "everyone active in this one workspace" (spec: workspace-wide locations). */
async function notifyLocationsChanged(workspaceId) {
  try {
    const allMemberUserIds = await resolveAllActiveMemberUserIds({ workspaceId });
    attendanceHooks.onLocationsUpdated(allMemberUserIds);
  } catch (error) {
    console.error('[Attendance] locations realtime hook error:', error.message);
  }
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
  await notifyLocationsChanged(req.workspaceId);
  res.status(201).json({ success: true, data: location });
});

export const updateLocation = asyncHandler(async (req, res) => {
  const location = await locationService.updateLocation({ workspaceId: req.workspaceId, locationId: req.params.locationId, updates: req.body, updatedBy: req.user.id });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_LOCATION_UPDATED', targetType: 'AttendanceLocation', targetId: location._id,
    resourceLabel: `Attendance Location: ${location.name}`, summary: `${req.user.name} updated attendance location "${location.name}"`,
    before: null, after: locationAuditSnapshot(location), category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  await notifyLocationsChanged(req.workspaceId);
  res.json({ success: true, data: location });
});

export const deactivateLocation = asyncHandler(async (req, res) => {
  const location = await locationService.deactivateLocation({ workspaceId: req.workspaceId, locationId: req.params.locationId, updatedBy: req.user.id });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_LOCATION_DEACTIVATED', targetType: 'AttendanceLocation', targetId: location._id,
    resourceLabel: `Attendance Location: ${location.name}`, summary: `${req.user.name} deactivated attendance location "${location.name}"`,
    before: null, after: null, category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  await notifyLocationsChanged(req.workspaceId);
  res.json({ success: true, data: location });
});

export const activateLocation = asyncHandler(async (req, res) => {
  const location = await locationService.activateLocation({ workspaceId: req.workspaceId, locationId: req.params.locationId, updatedBy: req.user.id });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_LOCATION_ACTIVATED', targetType: 'AttendanceLocation', targetId: location._id,
    resourceLabel: `Attendance Location: ${location.name}`, summary: `${req.user.name} activated attendance location "${location.name}"`,
    before: null, after: locationAuditSnapshot(location), category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  await notifyLocationsChanged(req.workspaceId);
  res.json({ success: true, data: location });
});

export const deleteLocation = asyncHandler(async (req, res) => {
  const location = await locationService.deleteLocation({ workspaceId: req.workspaceId, locationId: req.params.locationId, deletedBy: req.user.id });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_LOCATION_DELETED', targetType: 'AttendanceLocation', targetId: location._id,
    resourceLabel: `Attendance Location: ${location.name}`, summary: `${req.user.name} deleted attendance location "${location.name}"`,
    before: locationAuditSnapshot(location), after: null, category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  await notifyLocationsChanged(req.workspaceId);
  res.json({ success: true, data: location });
});
