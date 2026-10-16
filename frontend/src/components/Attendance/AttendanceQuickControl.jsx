import {stopDesktopCapture,DESKTOP_RESTART_MESSAGE} from '../../services/desktopTracking';
import { formatHours } from '../../utils/duration';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import { MapPin, LogIn, LogOut, CheckCircle2, Loader2 } from 'lucide-react';
import * as attendanceApi from '../../services/attendanceApi';
import WorkSelectionModal from '../Tracking/WorkSelectionModal';
import {getTrackingState} from '../../services/trackingApi';
import TrackingPanel from '../Tracking/TrackingPanel';

const GEO_OPTIONS = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };



function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, GEO_OPTIONS);
  });
}

/**
 * Best-effort read of the browser's own permission state for geolocation —
 * NOT the same question as "did we get a good fix." A `GeolocationPositionError`
 * can still happen with permission:'granted' (e.g. a timeout or the OS
 * reporting POSITION_UNAVAILABLE), and a huge `accuracy` value on a
 * *successful* read is a THIRD, separate condition again (permission was
 * granted, a position was returned, it's just a low-quality one — see the
 * debug log in captureGps below). `navigator.permissions` isn't universally
 * supported for the 'geolocation' name in every browser, so this is
 * defensive and never blocks the real capture.
 */
async function readGeolocationPermissionState() {
  try {
    if (!navigator.permissions?.query) return 'unsupported';
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state; // 'granted' | 'denied' | 'prompt'
  } catch {
    return 'unknown';
  }
}

async function captureGps() {
  const permissionState = await readGeolocationPermissionState();
  let position;
  try {
    position = await getCurrentPosition();
  } catch (error) {
    // error.code: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
    console.info('[Attendance][GPS Debug] getCurrentPosition FAILED', {
      permissionState, errorCode: error.code, errorMessage: error.message,
      enableHighAccuracy: GEO_OPTIONS.enableHighAccuracy, maximumAge: GEO_OPTIONS.maximumAge, timeout: GEO_OPTIONS.timeout
    });
    throw error;
  }

  // Every field requested for debugging a bad-accuracy fix, logged BEFORE
  // this ever reaches the backend. `enableHighAccuracy`/`maximumAge` only
  // control what the browser ASKS the OS's location provider for — they
  // cannot force a better fix to exist. A very large, suspiciously round
  // `accuracy` (e.g. exactly 10000) is the classic signature of the OS/
  // browser having fallen all the way back to coarse IP-based geolocation
  // (no GPS chip, no usable Wi-Fi scan, or the OS's location permission/
  // "precise location" toggle is off) — none of which this code can detect
  // or override; it can only report what it was actually given.
  console.info('[Attendance][GPS Debug] getCurrentPosition SUCCEEDED', {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp,
    enableHighAccuracy: GEO_OPTIONS.enableHighAccuracy,
    maximumAge: GEO_OPTIONS.maximumAge,
    timeout: GEO_OPTIONS.timeout,
    permissionState,
    // Not requested in the minimal shape above, but free diagnostic
    // context from the same reading — altitudeAccuracy in particular is
    // often null/0 on an IP-based fix and non-null on a real GPS one.
    altitude: position.coords.altitude, altitudeAccuracy: position.coords.altitudeAccuracy,
    heading: position.coords.heading, speed: position.coords.speed
  });

  return {
    coordinates: [position.coords.longitude, position.coords.latitude],
    reportedAccuracyMeters: position.coords.accuracy,
    capturedAt: new Date(position.timestamp).toISOString()
  };
}

/**
 * Mounts inside WelcomeHeader — the SAME check-in/check-out authority as
 * the dedicated Attendance page (GET /me/today, POST /check-in|/check-out),
 * never a separate Home-only code path (spec §40). Renders nothing at all
 * when the backend says attendance doesn't apply (e.g. a Workspace Admin) —
 * that's a real backend decision reflected here, never a frontend role
 * check standing in for it. GPS is only ever requested at the moment an
 * action needs it, never on mount/page load.
 */
const AttendanceQuickControl = () => {
  const isDesktop = window.flowtaskDesktop?.isDesktop === true;
  const [status, setStatus] = useState(null);
  const [showWorkSelection, setShowWorkSelection] = useState(false);
  const [phase, setPhase] = useState('loading'); // loading | idle | locating | submitting
  const [liveMinutes, setLiveMinutes] = useState(0);
  const [selectedWorkMode, setSelectedWorkMode] = useState(null);
  const tickRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await attendanceApi.getMyTodayStatus();
      setStatus(data);
      setSelectedWorkMode(data.defaultWorkMode || null);
    } catch {
      setStatus({ attendanceApplicable: false });
    } finally {
      setPhase('idle');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onChanged = () => load();
    window.addEventListener('socket-attendance-checked-in', onChanged);
    window.addEventListener('socket-attendance-checked-out', onChanged);
    window.addEventListener('socket-attendance-missed-checkout', onChanged);
    window.addEventListener('socket-attendance-updated', onChanged);
    window.addEventListener('socket-attendance-regularization-decided', onChanged);
    // A Location was added/edited/activated/deactivated/deleted anywhere in
    // this workspace — refetch so requiresGeofence/requiresGps (and thus
    // whether GPS is even attempted below) reflects the current
    // configuration immediately, not just on next page load (new spec §5).
    window.addEventListener('socket-attendance-locations-updated', onChanged);
    return () => {
      window.removeEventListener('socket-attendance-checked-in', onChanged);
      window.removeEventListener('socket-attendance-checked-out', onChanged);
      window.removeEventListener('socket-attendance-missed-checkout', onChanged);
      window.removeEventListener('socket-attendance-updated', onChanged);
      window.removeEventListener('socket-attendance-regularization-decided', onChanged);
      window.removeEventListener('socket-attendance-locations-updated', onChanged);
    };
  }, [load]);

  useEffect(() => {
    clearInterval(tickRef.current);
    if (!status?.activeSession?.checkInAt) { setLiveMinutes(0); return undefined; }
    const checkInAt = new Date(status.activeSession.checkInAt).getTime();
    const cutoffAt = status.activeSession.missedCheckoutCutoffAt
      ? new Date(status.activeSession.missedCheckoutCutoffAt).getTime()
      : Infinity;

    const tick = () => {
      const now = Date.now();
      if (now >= cutoffAt && cutoffAt !== Infinity) {
        // Expired — trigger reload so state updates
        load();
      }
      const effectiveEnd = Math.min(now, cutoffAt);
      setLiveMinutes(Math.max(0, (effectiveEnd - checkInAt) / 60000));
    };
    tick();
    tickRef.current = setInterval(tick, 30000);
    return () => clearInterval(tickRef.current);
  }, [status?.activeSession?.checkInAt, status?.activeSession?.missedCheckoutCutoffAt, load]);

  if (!status || !status.attendanceApplicable) return null;

  // GPS is attempted ONLY when the backend's own resolution says today's
  // mode actually needs it (requiresGeofence/requiresGps, already
  // workspace/location-aware — see attendanceWorkMode.service.js). A
  // workspace with no valid active Attendance Location configured must
  // never see a GPS permission prompt or error at all (new spec §2-3) —
  // skipping the capture attempt entirely, not just tolerating its
  // failure, is what actually prevents that prompt from firing. When
  // location IS required, this stays best-effort: the backend remains the
  // sole authority and rejects with LOCATION_PERMISSION_REQUIRED (a
  // friendly toast via the API interceptor) if capture still fails.
  const runAction = async (apiCall, successMessage, extraPayload = {}) => {
    const needsLocation = Boolean(status.requiresGeofence || status.requiresGps);
    setPhase(needsLocation ? 'locating' : 'submitting');
    let gps = null;
    if (needsLocation) {
      try { gps = await captureGps(); } catch { /* the backend will reject if this mode actually required it */ }
    }

    setPhase('submitting');
    try {
      const response=await apiCall({ ...(gps || {}), ...extraPayload });
      if(response.trackingStartup?.state==='FAILED')toast.warning(`Attendance is checked in. Work did not start: ${response.trackingStartup.message}. Use Start work to retry.`);
      toast.success(successMessage);
      await load();
      window.dispatchEvent(new Event('flowtask:tracking-refresh'));
      return true;
    } catch {
      setPhase('idle');
      return false;
    }
  };

  const handleCheckIn = async () => {try{const tracking=await getTrackingState();if(tracking.policy.enabled&&tracking.canTrack){setShowWorkSelection(true);return;}}catch{/* Attendance remains independently available */}await runAction(attendanceApi.checkIn,'Checked in',{requestedWorkMode:selectedWorkMode});};
  const confirmCheckIn = (workSelection, idempotencyKey) => runAction(attendanceApi.checkIn, 'Checked in', { requestedWorkMode: selectedWorkMode, workSelection, idempotencyKey });
  const handleCheckOut = async () => { if(!await stopDesktopCapture())toast.warning(DESKTOP_RESTART_MESSAGE); try { await runAction(attendanceApi.checkOut, 'Checked out'); } finally { await window.flowtaskDesktop?.tracking?.refresh(); } };

  const isBusy = phase === 'locating' || phase === 'submitting';
  const busyLabel = phase === 'locating' ? 'Locating…' : status.activeSession ? 'Checking Out…' : 'Checking In…';

  let content;
  if (isBusy && isDesktop) {
    content = (
      <button type="button" disabled className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white/80 bg-white/10 backdrop-blur-sm cursor-wait">
        <Loader2 className="h-4 w-4 animate-spin" /> {busyLabel}
      </button>
    );
  } else if (status.completed) {
    content = (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-white/15 backdrop-blur-sm">
          <CheckCircle2 className="h-4 w-4" /> Attendance Completed
        </div>
        {typeof status.workedMinutes === 'number' && (
          <span className="text-xs text-white/70">Worked {formatHours(status.workedMinutes)} today</span>
        )}
      </div>
    );
  } else if (status.activeSession) {
    content = (
      <div className="flex flex-col items-end gap-1.5">
        {isDesktop && <button
          type="button"
          onClick={handleCheckOut}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-white/15 backdrop-blur-sm hover:bg-white/25 transition-colors"
        >
          <LogOut className="h-4 w-4" /> Check Out
        </button>}
        <span className="text-xs text-white/70">Checked in · {formatHours(liveMinutes)}</span>
        <span className="text-xs text-white/70">Today's Work Mode: <span className="font-semibold text-white">{status.activeSession.workMode||status.activeSession.checkIn?.workMode||status.defaultWorkMode}</span></span>
      </div>
    );
  } else if (status.canCheckIn) {
    // Only ever offer a choice among modes the backend itself returned as
    // currently eligible (spec §21) — never a static/local list. With just
    // one allowed mode, no picker is shown at all and defaultWorkMode is
    // used automatically (spec §38: always name today's mode, whether or
    // not there's a real choice to make).
    const showModePicker = isDesktop && status.allowedWorkModes?.length > 1;
    content = (
      <div className="flex flex-col items-end gap-1.5">
        <span className="text-xs text-white/70">Today's Work Mode: <span className="font-semibold text-white">{selectedWorkMode}</span></span>
        {showModePicker && (
          <div className="flex gap-1 rounded-lg bg-white/10 p-1 backdrop-blur-sm">
            {status.allowedWorkModes.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSelectedWorkMode(mode)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${selectedWorkMode === mode ? 'bg-white text-indigo-700' : 'text-white/80 hover:bg-white/15'}`}
              >
                {mode}
              </button>
            ))}
          </div>
        )}
        {isDesktop && <button
          type="button"
          onClick={handleCheckIn}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-white/15 backdrop-blur-sm hover:bg-white/25 transition-colors"
        >
          <LogIn className="h-4 w-4" /> Check In
        </button>}
      </div>
    );
  } else {
    content = (
      <div className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white/80 bg-white/10 backdrop-blur-sm">
        <MapPin className="h-4 w-4" /> {friendlyBlockingLabel(status.blockingReason)}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {content}
      {!isDesktop && !status.completed && (status.activeSession || status.canCheckIn) && <span className="text-xs text-white/70">Use the FlowTask desktop app to check in and check out.</span>}
      {status.activeSession && <TrackingPanel compact />}
      {isDesktop && showWorkSelection && <WorkSelectionModal checkingIn onClose={() => setShowWorkSelection(false)} onConfirm={confirmCheckIn} />}
      {status.unresolvedMissedCheckout && (
        <span className="text-[11px] font-medium text-amber-300">
          Missed checkout on {status.unresolvedMissedCheckout.workDateKey} · Regularize in Attendance
        </span>
      )}
    </div>
  );
};

function friendlyBlockingLabel(code) {
  const labels = {
    NON_WORKING_DAY: "Today's a day off",
    FULL_DAY_LEAVE_ACTIVE: "You're on leave today",
    ATTENDANCE_COMPLETED: 'Attendance completed',
    WFH_NOT_APPROVED: 'WFH not approved',
    WORK_MODE_NOT_AUTHORIZED: 'Attendance unavailable',
    WORK_MODE_NOT_ALLOWED: 'Attendance unavailable',
    MISSED_CHECKOUT_EXPIRED: 'Session expired (missed checkout)',
    STALE_ACTIVE_SESSION: 'Previous day session expired'
  };
  return labels[code] || 'Attendance unavailable';
}

export default AttendanceQuickControl;
