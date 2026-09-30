import AttendanceLocation from './attendanceLocation.model.js';
import logger from '../../utils/logger.js';

const EARTH_RADIUS_METERS = 6371000;

/** Human-readable rejection category, matching the 6 buckets support/ops actually cares about when a check-in is denied. */
const FAILURE_CATEGORIES = {
  LOCATION_PERMISSION_REQUIRED: 'MISSING_OR_INVALID_COORDINATES',
  GPS_COORDINATES_STALE: 'OTHER_VALIDATION_FAILURE (stale GPS fix)',
  GPS_ACCURACY_TOO_LOW: 'GPS_ACCURACY_TOO_LOW',
  LOCATION_NOT_ASSIGNED: 'NO_CONFIGURED_OFFICE_LOCATION',
  OUTSIDE_GEOFENCE: 'OUTSIDE_CONFIGURED_OFFICE_RADIUS'
};

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
 * Every location an attendance-eligible employee may check in at:
 * EVERY active location in the workspace — full stop. Creating an
 * Office/Branch location makes it immediately available workspace-wide;
 * there is no per-user/department assignment step, and never was meant to
 * be one (a prior version of this module required an explicit
 * AttendanceLocationAssignment row, which is exactly the "assign this
 * location to users?" ceremony the spec is explicit must not exist for
 * normal Office/Branch access — see the model file's own note). Never
 * trusts a client-supplied locationId — this is the only function that
 * decides what's eligible; the geofence check below only ever validates
 * against locations this function returned. Workspace isolation alone
 * (workspaceId) is what scopes this, exactly as strict as before.
 */
/**
 * True only when a location's coordinates/radius genuinely pass real
 * validation — the schema already enforces this at create/update time
 * (so this is realistically always true for anything actually saved), but
 * this is never assumed. A location the backend wouldn't itself consider
 * "configured" must never silently count as one (new spec §11).
 */
function isValidLocationDocument(location) {
  const coords = location?.location?.coordinates;
  const [lon, lat] = Array.isArray(coords) ? coords : [null, null];
  return Number.isFinite(lat) && lat >= -90 && lat <= 90
    && Number.isFinite(lon) && lon >= -180 && lon <= 180
    && Number.isFinite(location?.allowedRadiusMeters) && location.allowedRadiusMeters > 0;
}

export async function resolveEligibleLocations({ workspaceId }) {
  // deletedAt is redundant with active:false in practice (deleteLocation
  // always sets both together) but kept explicit as a defense-in-depth
  // belt-and-suspenders check directly on the one query that actually
  // grants check-in eligibility. The isValidLocationDocument filter is the
  // SAME single source of truth every caller of this function shares —
  // including resolveWorkspaceLocationAvailability below — so "is this
  // location real" is never independently re-derived elsewhere.
  const locations = await AttendanceLocation.find({ workspaceId, active: true, deletedAt: null }).lean();
  return locations.filter(isValidLocationDocument);
}

/**
 * Whether this workspace currently has at least one valid, active,
 * properly-configured Attendance Location — the single source of truth
 * for "should OFFICE-mode check-in even require GPS/geofence at all" (new
 * spec: a workspace that hasn't set up geofencing yet, or has deliberately
 * removed its only location, must never block ordinary attendance on a
 * requirement nobody actually configured). Consumed by
 * attendanceWorkMode.service.js — never re-implemented there.
 */
export async function resolveWorkspaceLocationAvailability({ workspaceId }) {
  const validLocations = await resolveEligibleLocations({ workspaceId });
  return { validLocationCount: validLocations.length, hasValidLocation: validLocations.length > 0 };
}

/**
 * The GPS quality gate shared by every mode that captures location
 * evidence — shape, freshness, accuracy. Deliberately does NOT decide
 * distance-to-a-location; OFFICE/FIELD-with-geofence layer that check on
 * top via validateAttendanceGeofence below, while WFH (which never
 * geofences — spec: "WFH Day = Anywhere") calls this directly so poor/
 * stale GPS still gets rejected without ever comparing against an office
 * location (spec §8-9).
 */
export function validateGpsQuality({ coordinates, reportedAccuracyMeters, capturedAt, gpsRequirements, nowInstant = new Date() }) {
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
  return { valid: true };
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
  const quality = validateGpsQuality({ coordinates, reportedAccuracyMeters, capturedAt, gpsRequirements, nowInstant });
  if (!quality.valid) return quality;

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

/**
 * Nearest configured location by straight-line distance, regardless of
 * whether it's within radius — for DIAGNOSTICS only (logCheckInLocationValidation
 * below), never for the actual authorization decision (validateAttendanceGeofence
 * above is the one and only source of truth for that). This is what lets a
 * rejected check-in's log still show a real, meaningful distance/inside-
 * geofence verdict even when the rejection happened for an unrelated reason
 * (e.g. GPS accuracy) before the real decision ever got to compare distance.
 */
export function resolveNearestLocationForDiagnostics({ coordinates, eligibleLocations = [] }) {
  if (!Array.isArray(coordinates) || coordinates.length !== 2 || !eligibleLocations.length) return null;
  const [lon, lat] = coordinates;
  let nearest = null;
  for (const location of eligibleLocations) {
    const [locLon, locLat] = location.location.coordinates;
    const distanceMeters = haversineDistanceMeters(lat, lon, locLat, locLon);
    if (!nearest || distanceMeters < nearest.distanceMeters) nearest = { location, distanceMeters };
  }
  return { location: nearest.location, distanceMeters: Math.round(nearest.distanceMeters) };
}

/**
 * The detailed "why was this check-in/check-out accepted/rejected"
 * diagnostic trail requested for support/ops — fired on every OFFICE/
 * FIELD-with-geofence attempt, success or failure, so a specific user's
 * rejection can always be explained from the logs without having to
 * reproduce it. `action`: 'CHECK-IN' | 'CHECK-OUT' — check-out validates
 * against the session's own pinned check-in location (see attendance.
 * service.js#checkOut's own comment on why), never a freshly re-resolved
 * list, but the diagnostic shape is otherwise identical. `logger.warn` on
 * rejection (scannable in the log stream at a glance), `logger.info` on
 * success. A logging failure here must never fail the real request, so
 * every path is wrapped defensively.
 */
export function logAttendanceLocationValidation({
  action = 'CHECK-IN', userId, actorName = null, workspaceId, workMode, gps, eligibleLocations = [], gpsRequirements, geofenceResult
}) {
  try {
    const coordinates = gps?.coordinates || null;
    const nearest = resolveNearestLocationForDiagnostics({ coordinates, eligibleLocations });
    const matchedLocation = geofenceResult?.valid
      ? eligibleLocations.find((l) => String(l._id) === String(geofenceResult.locationId)) || nearest?.location
      : nearest?.location || eligibleLocations[0] || null;

    const [userLon, userLat] = coordinates || [null, null];
    const allowed = Boolean(geofenceResult?.valid);
    // Whether accuracy specifically was the thing that failed — the prior
    // checks (coordinate shape, staleness) run before accuracy inside
    // validateGpsQuality, so any OTHER code here means accuracy itself was
    // fine, and no code/valid:true also means it was fine.
    const accuracyAccepted = geofenceResult?.code === 'GPS_ACCURACY_TOO_LOW' ? false
      : (geofenceResult?.code === 'LOCATION_PERMISSION_REQUIRED' || geofenceResult?.code === 'GPS_COORDINATES_STALE') ? null
      : true;
    // Independent of the short-circuited validation result — computed
    // directly from the nearest location's own radius, so this is always
    // meaningful even when a different check (e.g. accuracy) rejected first.
    const insideGeofence = nearest && matchedLocation ? nearest.distanceMeters <= matchedLocation.allowedRadiusMeters : null;
    const failureCategory = allowed ? null : (FAILURE_CATEGORIES[geofenceResult?.code] || `OTHER_VALIDATION_FAILURE (${geofenceResult?.code || 'unknown'})`);

    const lines = [
      `${action} LOCATION VALIDATION`,
      `User: ${actorName || 'Unknown'} (ID: ${userId})`,
      `Workspace/Branch ID: ${workspaceId}`,
      `Work Mode: ${workMode}`,
      '',
      'Configured Office (used for validation):',
      matchedLocation
        ? [
          `  Name: ${matchedLocation.name}`,
          `  Location ID: ${matchedLocation._id}`,
          `  Latitude: ${matchedLocation.location?.coordinates?.[1]}`,
          `  Longitude: ${matchedLocation.location?.coordinates?.[0]}`,
          `  Radius: ${matchedLocation.allowedRadiusMeters}m`
        ].join('\n')
        : `  None configured (${eligibleLocations.length} active location(s) in this workspace)`,
      '',
      'User Location:',
      `  Latitude: ${userLat ?? 'missing'}`,
      `  Longitude: ${userLon ?? 'missing'}`,
      `  Accuracy: ${gps?.reportedAccuracyMeters ?? 'missing'}m`,
      `  Timestamp: ${gps?.capturedAt ? new Date(gps.capturedAt).toISOString() : 'missing'}`,
      '',
      `Calculated Distance: ${nearest ? `${nearest.distanceMeters}m` : 'n/a (no coordinates or no configured location)'}`,
      '',
      'Result:',
      `  INSIDE GEOFENCE = ${insideGeofence === null ? 'n/a' : insideGeofence}`,
      `  ACCURACY ACCEPTED = ${accuracyAccepted === null ? 'n/a' : accuracyAccepted}`,
      `  MAX ACCURACY ALLOWED = ${gpsRequirements?.maximumGpsAccuracyMeters ?? 'n/a'}m`,
      allowed ? `  ${action} = ALLOWED` : ['', `REJECTED: ${geofenceResult?.code || 'UNKNOWN'}`, `Failure category: ${failureCategory}`].join('\n')
    ];
    const message = lines.join('\n');

    const meta = {
      action, userId: String(userId), actorName, workspaceId: String(workspaceId), workMode,
      locationId: matchedLocation ? String(matchedLocation._id) : null, locationName: matchedLocation?.name || null,
      officeLatitude: matchedLocation?.location?.coordinates?.[1] ?? null, officeLongitude: matchedLocation?.location?.coordinates?.[0] ?? null,
      allowedRadiusMeters: matchedLocation?.allowedRadiusMeters ?? null, totalConfiguredLocations: eligibleLocations.length,
      userLatitude: userLat, userLongitude: userLon, reportedAccuracyMeters: gps?.reportedAccuracyMeters ?? null,
      maximumGpsAccuracyMeters: gpsRequirements?.maximumGpsAccuracyMeters ?? null,
      capturedAt: gps?.capturedAt ? new Date(gps.capturedAt).toISOString() : null,
      distanceMeters: nearest?.distanceMeters ?? null, insideGeofence, accuracyAccepted,
      decision: allowed ? 'ALLOWED' : 'REJECTED', rejectionCode: allowed ? null : (geofenceResult?.code || 'UNKNOWN'), failureCategory
    };

    if (allowed) logger.info(message, meta); else logger.warn(message, meta);
  } catch (error) {
    logger.error('[Attendance] check-in location validation logging itself failed (non-fatal — the real check-in decision is unaffected)', { error: error.message });
  }
}
