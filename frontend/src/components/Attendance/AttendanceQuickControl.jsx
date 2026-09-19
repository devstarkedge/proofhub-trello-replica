import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import { MapPin, LogIn, LogOut, CheckCircle2, Loader2 } from 'lucide-react';
import * as attendanceApi from '../../services/attendanceApi';

const GEO_OPTIONS = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };

function formatDuration(totalMinutes) {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, GEO_OPTIONS);
  });
}

async function captureGps() {
  const position = await getCurrentPosition();
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
  const [status, setStatus] = useState(null);
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
    return () => {
      window.removeEventListener('socket-attendance-checked-in', onChanged);
      window.removeEventListener('socket-attendance-checked-out', onChanged);
    };
  }, [load]);

  useEffect(() => {
    clearInterval(tickRef.current);
    if (!status?.activeSession?.checkInAt) { setLiveMinutes(0); return undefined; }
    const checkInAt = new Date(status.activeSession.checkInAt).getTime();
    const tick = () => setLiveMinutes((Date.now() - checkInAt) / 60000);
    tick();
    tickRef.current = setInterval(tick, 30000);
    return () => clearInterval(tickRef.current);
  }, [status?.activeSession?.checkInAt]);

  if (!status || !status.attendanceApplicable) return null;

  // Best-effort GPS capture on every action, regardless of which mode is
  // selected — a per-mode requirement isn't known on the client (never
  // re-derived here per spec §20), so the backend remains the sole
  // authority: it rejects with LOCATION_PERMISSION_REQUIRED (surfaced as a
  // friendly toast by the API interceptor) when the resolved mode actually
  // needed GPS and none was captured.
  const runAction = async (apiCall, successMessage, extraPayload = {}) => {
    setPhase('locating');
    let gps = null;
    try { gps = await captureGps(); } catch { /* the backend will reject if this mode actually required it */ }

    setPhase('submitting');
    try {
      await apiCall({ ...(gps || {}), ...extraPayload });
      toast.success(successMessage);
      await load();
    } catch {
      setPhase('idle');
    }
  };

  const handleCheckIn = () => runAction(attendanceApi.checkIn, 'Checked in', { requestedWorkMode: selectedWorkMode });
  const handleCheckOut = () => runAction(attendanceApi.checkOut, 'Checked out');

  const isBusy = phase === 'locating' || phase === 'submitting';
  const busyLabel = phase === 'locating' ? 'Locating…' : status.activeSession ? 'Checking Out…' : 'Checking In…';

  let content;
  if (isBusy) {
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
          <span className="text-xs text-white/70">Worked {formatDuration(status.workedMinutes)} today</span>
        )}
      </div>
    );
  } else if (status.activeSession) {
    content = (
      <div className="flex flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={handleCheckOut}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-white/15 backdrop-blur-sm hover:bg-white/25 transition-colors"
        >
          <LogOut className="h-4 w-4" /> Check Out
        </button>
        <span className="text-xs text-white/70">Checked in · {formatDuration(liveMinutes)}</span>
      </div>
    );
  } else if (status.canCheckIn) {
    // Only ever offer a choice among modes the backend itself returned as
    // currently eligible (spec §21) — never a static/local list. With just
    // one allowed mode, no picker is shown at all and defaultWorkMode is
    // used automatically.
    const showModePicker = status.allowedWorkModes?.length > 1;
    content = (
      <div className="flex flex-col items-end gap-1.5">
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
        <button
          type="button"
          onClick={handleCheckIn}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-white/15 backdrop-blur-sm hover:bg-white/25 transition-colors"
        >
          <LogIn className="h-4 w-4" /> Check In
        </button>
      </div>
    );
  } else {
    content = (
      <div className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white/80 bg-white/10 backdrop-blur-sm">
        <MapPin className="h-4 w-4" /> {friendlyBlockingLabel(status.blockingReason)}
      </div>
    );
  }

  return <div className="flex flex-col items-end">{content}</div>;
};

function friendlyBlockingLabel(code) {
  const labels = {
    NON_WORKING_DAY: "Today's a day off",
    FULL_DAY_LEAVE_ACTIVE: "You're on leave today",
    ATTENDANCE_COMPLETED: 'Attendance completed',
    WFH_NOT_APPROVED: 'WFH not approved',
    WORK_MODE_NOT_AUTHORIZED: 'Attendance unavailable',
    WORK_MODE_NOT_ALLOWED: 'Attendance unavailable'
  };
  return labels[code] || 'Attendance unavailable';
}

export default AttendanceQuickControl;
