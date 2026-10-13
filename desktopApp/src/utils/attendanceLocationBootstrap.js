import * as attendanceApi from '../services/attendanceApi';

const ATTEMPTED_KEY = 'attendanceLocationBootstrapAttempted';
const PERMISSION_STATE_KEY = 'attendanceLocationPermissionState';

// A capability prime only — never a check-in/check-out location fix, so it
// doesn't need check-in-grade accuracy or freshness.
const GEO_OPTIONS = { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 };

function readFlag(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function writeFlag(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* best-effort only, never blocks the app */ }
}

/** Cleared on logout (AuthContext#logoutUser) so a fresh login gets a fresh attempt. */
export function clearAttendanceLocationBootstrapState() {
  try {
    sessionStorage.removeItem(ATTEMPTED_KEY);
    sessionStorage.removeItem(PERMISSION_STATE_KEY);
  } catch { /* best-effort only */ }
}

/**
 * Login Location Permission Bootstrap. Immediately after login + active-
 * workspace resolution (MainLayout only ever mounts once both are true —
 * see PrivateRoute), if the signed-in member is attendance-eligible, prime
 * the browser's geolocation permission ONCE so the real check-in flow
 * doesn't hit a cold permission prompt. This is priming only:
 * - never creates an AttendanceSession or is sent to the backend as evidence
 * - never blocks login, navigation, or anything else on denial/failure
 * - runs at most once per login session — the ATTEMPTED flag is written
 *   before any await, so a React StrictMode double-invoke (or any other
 *   double-mount) is a guaranteed no-op, not a second permission prompt
 * - a real check-in/check-out always takes its own fresh GPS sample later;
 *   this sample is never reused as attendance evidence
 */
export async function runAttendanceLocationBootstrapOnce() {
  if (readFlag(ATTEMPTED_KEY) === 'true') return;
  writeFlag(ATTEMPTED_KEY, 'true');

  let requiresLocation = false;
  try {
    const { data } = await attendanceApi.getMyTodayStatus();
    // Both must be true: the member is attendance-required AND the
    // backend actually needs GPS/geofence for today's resolved mode.
    // requiresGps/requiresGeofence already reflect whether this workspace
    // even has a valid active Attendance Location configured — a
    // workspace that never set one up (or removed its only one) must
    // never see a GPS permission prompt at all, on login or otherwise
    // (new spec).
    requiresLocation = Boolean(data?.attendanceRequired) && Boolean(data?.requiresGps || data?.requiresGeofence);
  } catch {
    writeFlag(PERMISSION_STATE_KEY, 'unknown');
    return;
  }
  if (!requiresLocation) { writeFlag(PERMISSION_STATE_KEY, 'not_applicable'); return; }

  if (!navigator.geolocation) { writeFlag(PERMISSION_STATE_KEY, 'unavailable'); return; }

  try {
    await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, GEO_OPTIONS));
    writeFlag(PERMISSION_STATE_KEY, 'granted');
  } catch (error) {
    writeFlag(PERMISSION_STATE_KEY, error?.code === 1 ? 'denied' : 'error');
  }
}
