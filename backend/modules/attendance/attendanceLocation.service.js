import AttendanceLocation from './attendanceLocation.model.js';
import AttendanceLocationAssignment from './attendanceLocationAssignment.model.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';

/**
 * Location CRUD (spec §13-15). Whether the lat/lng came from the Admin/HR
 * "Use Current Location" GPS auto-fetch flow or manual typing is a
 * frontend-only distinction — either way this service only ever saves on
 * an explicit call after the UI has shown the value for review, never
 * automatically. Locations are never hard-deleted (spec §15) — only
 * `active` is ever flipped, so a historical session's snapshotted
 * location reference always stays resolvable.
 */

export async function listLocations({ workspaceId, includeInactive = false }) {
  const filter = { workspaceId };
  if (!includeInactive) filter.active = true;
  return AttendanceLocation.find(filter).sort({ name: 1 }).lean();
}

function assertValidCoordinates(latitude, longitude) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    throw new ErrorResponse('A valid latitude and longitude are required', 400);
  }
  if (latitude < -90 || latitude > 90) throw new ErrorResponse('Latitude must be between -90 and 90', 400);
  if (longitude < -180 || longitude > 180) throw new ErrorResponse('Longitude must be between -180 and 180', 400);
}

export async function createLocation({ workspaceId, name, type, latitude, longitude, allowedRadiusMeters, createdBy }) {
  if (!name?.trim()) throw new ErrorResponse('Location name is required', 400);
  assertValidCoordinates(latitude, longitude);
  if (!allowedRadiusMeters || allowedRadiusMeters < 1) throw new ErrorResponse('A valid allowed radius (in meters) is required', 400);

  return AttendanceLocation.create({
    workspaceId, name, type: type || 'OFFICE',
    location: { type: 'Point', coordinates: [longitude, latitude] },
    allowedRadiusMeters, active: true, createdBy, updatedBy: createdBy
  });
}

export async function updateLocation({ workspaceId, locationId, updates, updatedBy }) {
  const location = await AttendanceLocation.findOne({ _id: locationId, workspaceId });
  if (!location) throw new ErrorResponse('Location not found', 404);

  if (updates.name !== undefined) location.name = updates.name;
  if (updates.type !== undefined) location.type = updates.type;
  if (updates.allowedRadiusMeters !== undefined) location.allowedRadiusMeters = updates.allowedRadiusMeters;
  if (updates.latitude !== undefined || updates.longitude !== undefined) {
    const latitude = updates.latitude ?? location.location.coordinates[1];
    const longitude = updates.longitude ?? location.location.coordinates[0];
    assertValidCoordinates(latitude, longitude);
    location.location = { type: 'Point', coordinates: [longitude, latitude] };
  }
  location.updatedBy = updatedBy;
  await location.save();
  return location;
}

export async function deactivateLocation({ workspaceId, locationId, updatedBy }) {
  const location = await AttendanceLocation.findOneAndUpdate(
    { _id: locationId, workspaceId }, { $set: { active: false, updatedBy } }, { new: true }
  );
  if (!location) throw new ErrorResponse('Location not found', 404);
  return location;
}

export async function listLocationAssignments({ workspaceId }) {
  return AttendanceLocationAssignment.find({ workspaceId, isActive: true }).populate('location', 'name type active').sort({ scope: 1 }).lean();
}

export async function createLocationAssignment({ workspaceId, locationId, scope, scopeRef, createdBy }) {
  const location = await AttendanceLocation.findOne({ _id: locationId, workspaceId, active: true });
  if (!location) throw new ErrorResponse('Location not found or inactive', 404);
  if (!['user', 'department'].includes(scope)) throw new ErrorResponse('scope must be "user" or "department"', 400);
  if (!scopeRef) throw new ErrorResponse('scopeRef is required', 400);

  return AttendanceLocationAssignment.create({ workspaceId, location: locationId, scope, scopeRef, isActive: true, createdBy });
}

export async function removeLocationAssignment({ workspaceId, assignmentId }) {
  const assignment = await AttendanceLocationAssignment.findOneAndUpdate(
    { _id: assignmentId, workspaceId }, { $set: { isActive: false } }, { new: true }
  );
  if (!assignment) throw new ErrorResponse('Location assignment not found', 404);
  return assignment;
}
