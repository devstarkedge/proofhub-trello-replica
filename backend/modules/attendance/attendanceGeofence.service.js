import AttendanceLocation from './attendanceLocation.model.js';
import AttendanceLocationAssignment from './attendanceLocationAssignment.model.js';

const EARTH_RADIUS_METERS = 6371000;

/**
 * Great-circle distance between two lat/lon points, in meters. Takes
 * (latitude, longitude) pairs — the natural order for this formula — NOT
 * GeoJSON's [longitude, latitude] array order; every caller pulling from a
 * stored `location.coordinates` array MUST destructure it as
 * `[lng, lat]` and pass `(lat, lng)` here explicitly (see
 * `resolveGeofenceMatch` below for the one place that conversion happens).
 */
export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.asin(Math.sqrt(Math.min(1, a)));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Every location this user may legitimately check in at: direct
 * assignment + their department's assignment + (only if explicitly
 * enabled by the policy's office.allowAnyActiveWorkspaceLocation OR this
 * user's own profile.allowAnyWorkspaceLocation override) every active
 * workspace location. Never trusts a client-supplied locationId — this is
 * the only function that decides what's eligible; the geofence check
 * below only ever validates against locations this function returned.
 */
export async function resolveEligibleLocations({ workspaceId, userId, membership, policyVersion = null, profile = null }) {
  const allowAny = Boolean(policyVersion?.office?.allowAnyActiveWorkspaceLocation || profile?.allowAnyWorkspaceLocation);
  if (allowAny) {
    return AttendanceLocation.find({ workspaceId, active: true }).lean();
  }

  const departmentIds = (membership?.department || []).map(String);
  const assignments = await AttendanceLocationAssignment.find({
    workspaceId, isActive: true,
    $or: [
      { scope: 'user', scopeRef: userId },
      ...(departmentIds.length ? [{ scope: 'department', scopeRef: { $in: departmentIds } }] : [])
    ]
  }).lean();
  if (!assignments.length) return [];

  const locationIds = Array.from(new Set(assignments.map((a) => String(a.location))));
  return AttendanceLocation.find({ workspaceId, active: true, _id: { $in: locationIds } }).lean();
}

/**
 * The single centralized geofence decision (spec §17). Never trusts a
 * client-computed distance — always recomputes via Haversine against the
 * eligible-locations list (never an arbitrary client-chosen location).
 * Returns a structured, machine-readable result rather than throwing, so
 * the caller (attendance.service.js) can map straight to the spec's error
 * codes without re-deriving the reason.
 *
 * GPS quality gates run BEFORE the distance check, in the order the spec
 * lists them (stale coordinates and poor accuracy are rejected outright,
 * never used to silently widen the allowed radius).
 */
export function validateAttendanceGeofence({ coordinates, reportedAccuracyMeters, capturedAt, eligibleLocations, gpsRequirements, nowInstant = new Date() }) {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    return { valid: false, code: 'LOCATION_PERMISSION_REQUIRED' };
  }
  if (!capturedAt) {
    return { valid: false, code: 'GPS_COORDINATES_STALE' };
  }
  const ageSeconds = (nowInstant.getTime() - new Date(capturedAt).getTime()) / 1000;
  if (!Number.isFinite(ageSeconds) || ageSeconds > gpsRequirements.maximumCoordinateAgeSeconds || ageSeconds < -30) {
    // A small negative-age tolerance covers ordinary clock skew between
    // the device and server; anything beyond that (or a future timestamp
    // from a badly-skewed/spoofed clock) is rejected the same as stale.
    return { valid: false, code: 'GPS_COORDINATES_STALE' };
  }
  if (typeof reportedAccuracyMeters !== 'number' || reportedAccuracyMeters > gpsRequirements.maximumGpsAccuracyMeters) {
    return { valid: false, code: 'GPS_ACCURACY_TOO_LOW' };
  }
  if (!eligibleLocations.length) {
    return { valid: false, code: 'LOCATION_NOT_ASSIGNED' };
  }

  const [lon, lat] = coordinates; // GeoJSON order — converted to (lat, lon) once, here
  let best = null;
  for (const location of eligibleLocations) {
    const [locLon, locLat] = location.location.coordinates;
    const distanceMeters = haversineDistanceMeters(lat, lon, locLat, locLon);
    if (distanceMeters <= location.allowedRadiusMeters && (!best || distanceMeters < best.distanceMeters)) {
      best = { location, distanceMeters };
    }
  }
  if (!best) {
    return { valid: false, code: 'OUTSIDE_GEOFENCE' };
  }

  return {
    valid: true,
    locationId: best.location._id,
    distanceMeters: Math.round(best.distanceMeters),
    allowedRadiusMeters: best.location.allowedRadiusMeters
  };
}
