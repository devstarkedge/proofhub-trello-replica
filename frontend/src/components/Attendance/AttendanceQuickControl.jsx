import useSessionAction from '../../hooks/useSessionAction';
import {finalizeDesktopCapture} from '../../services/desktopTracking';
import { formatHours } from '../../utils/duration';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import { MapPin, LogIn, LogOut, CheckCircle2, Loader2, BriefcaseBusiness, ChevronDown } from 'lucide-react';
import * as attendanceApi from '../../services/attendanceApi';
import WorkSelectionModal from '../Tracking/WorkSelectionModal';
import {trackingStore} from '../../services/trackingState';
import useAttendanceSession from '../../hooks/useAttendanceSession';
import useSessionClock from '../../hooks/useSessionClock';
import TrackingPanel from '../Tracking/TrackingPanel';
import CheckOutConfirmationModal from './CheckOutConfirmationModal';

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
  const sessionAction=useSessionAction();
  const isDesktop = window.flowtaskDesktop?.isDesktop === true;
  const {status,error:sessionError,reload:load,scope,workspaceId,expired}=useAttendanceSession();
  const [showWorkSelection, setShowWorkSelection] = useState(false);
  const [showCheckOut,setShowCheckOut] = useState(false);
  const checkoutInactive=useCallback(()=>{setShowCheckOut(false);window.dispatchEvent(new Event('socket-attendance-updated'));},[]);
  const [attendanceOnly, setAttendanceOnly] = useState(false);
  // A ref guards even clicks in the same render; choosing work is not a check-in.
  const operationRef = useRef(null);
  const [phase, setPhase] = useState('idle'); // loading | idle | preparing | locating | submitting
  const [selectedWorkMode, setSelectedWorkMode] = useState(null);
  const checkoutSessionRef=useRef(null);

  useEffect(()=>{if(!operationRef.current)setSelectedWorkMode(status?.defaultWorkMode||null);},[status?.defaultWorkMode,scope]);
  useEffect(()=>{operationRef.current=null;setShowWorkSelection(false);setShowCheckOut(false);setPhase('idle');},[scope]);

  if (!status) return <div className="welcome-controls welcome-check-in" role={sessionError?'alert':'status'}><p className="text-sm text-white/80">{sessionError||'Loading attendance…'}</p>{sessionError&&<button type="button" className="welcome-action" onClick={load}>Retry attendance</button>}</div>;
  if (!status.attendanceApplicable) return null;

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
  const runAction = async (apiCall, successMessage, extraPayload = {}, options = {}) => {
    const needsLocation = Boolean(status.requiresGeofence || status.requiresGps);
    setPhase(needsLocation ? 'locating' : 'submitting');
    let gps = null;
    if (needsLocation) {
      try { gps = await captureGps(); } catch { /* the backend will reject if this mode actually required it */ }
    }

    setPhase('submitting');
    try {
      const payload={...(gps||{}),...extraPayload},checkingIn=apiCall===attendanceApi.checkIn;
      const operationId=checkingIn?payload.idempotencyKey:payload.operationId;
      const response=await sessionAction.run({kind:checkingIn?'attendance-checkin':'attendance-checkout',action:checkingIn?'checkin':'checkout',operationId,sessionId:status.activeSession?._id,payload},()=>apiCall(payload));
      if(response.trackingStartup?.state==='FAILED')toast.warning(`Attendance is checked in. Work did not start: ${response.trackingStartup.message}. Use Start work to retry.`);
      // The shared action receipt updates the session caches before native IO.
      if(options.onResponse)Promise.resolve(options.onResponse(response)).catch(()=>{});
      toast.success(successMessage);
      return response;
    } catch (error) {
      if(options.propagateError)throw error;
      if([403,423].includes(error.response?.status))toast.error(error.response?.data?.message||error.message);
      return false;
    } finally {
      setPhase('idle');
    }
  };

  const handleCheckIn = () => {
    if (operationRef.current || sessionAction.busy || sessionError) return;
    const tracking=trackingStore(scope,workspaceId).getSnapshot().state;
    setAttendanceOnly(tracking ? !(tracking.policy?.enabled&&tracking.canTrack) : false);
    operationRef.current='selecting';setShowWorkSelection(true);
  };
  const closeWorkSelection = () => {
    if (operationRef.current === 'submitting') return;
    operationRef.current = null;
    setShowWorkSelection(false);
    setPhase('idle');
  };
  const confirmCheckIn = async (workSelection, idempotencyKey) => {
    if (operationRef.current !== 'selecting') return false;
    operationRef.current = 'submitting';
    const success = await runAction(attendanceApi.checkIn, 'Checked in', { requestedWorkMode: selectedWorkMode, workSelection, idempotencyKey });
    operationRef.current = success ? null : 'selecting';
    return success;
  };
  const handleCheckOut = () => {if(!operationRef.current){checkoutSessionRef.current=status.activeSession?._id;setShowCheckOut(true);}};
  const confirmCheckOut = async (preview,operationId) => {
    if(operationRef.current)return false;
    operationRef.current='submitting';
    try {
      return await runAction(attendanceApi.checkOut,'Checked out',{attendanceSessionId:preview.attendanceSessionId,operationId,previewToken:preview.previewToken},{propagateError:true,onResponse:async response=>{
        const stopped=await finalizeDesktopCapture({attendanceSessionId:String(response.data._id),workSessionIds:response.summary?.workSessionIds||preview.workSessionIds,cutoffAt:response.data.checkOutAt});
        if(!stopped)toast.warning('Attendance is checked out. Desktop monitoring stop is awaiting acknowledgment; saved screenshots can still sync. Restart an outdated desktop app.');
      }});
    } finally {
      operationRef.current=null;setPhase('idle');
      window.flowtaskDesktop?.tracking?.refresh?.()?.catch(()=>{});
    }
  };

  const isBusy = sessionAction.busy || Boolean(sessionError) || expired || ['preparing', 'locating', 'submitting'].includes(phase);
  const attendancePending = ['preparing', 'locating', 'submitting'].includes(phase) || sessionAction.phase==='PENDING'&&sessionAction.kind?.startsWith('attendance-');
  const busyLabel = phase === 'locating' ? 'Locating…' : showCheckOut || sessionAction.action==='checkout' ? 'Checking Out…' : 'Checking In…';

  const mode = status.activeSession?.workMode || status.activeSession?.checkIn?.workMode || selectedWorkMode || status.defaultWorkMode;
  const modeControl = mode ? <label className="welcome-work-mode" title="Today's Work Mode">
    <BriefcaseBusiness size={15} aria-hidden="true" />
    {isDesktop && !status.activeSession && status.canCheckIn && status.allowedWorkModes?.length > 1
      ? <><select aria-label="Today's Work Mode" disabled={isBusy} value={selectedWorkMode || ''} onChange={event => setSelectedWorkMode(event.target.value)}>{status.allowedWorkModes.map(value => <option key={value} value={value}>{value}</option>)}</select><ChevronDown size={13} aria-hidden="true" /></>
      : <span>{mode}</span>}
  </label> : null;
  const hasAttendanceDetails = Boolean(
    status.activeSession?.checkInAt ||
    (status.completed && typeof status.workedMinutes === 'number') ||
    (!isDesktop && !status.completed && (status.activeSession || status.canCheckIn)) ||
    status.unresolvedMissedCheckout
  );
  const attendanceDetails = hasAttendanceDetails ? <div className="space-y-2 text-xs">
    {status.activeSession?.checkInAt && <AttendanceElapsed status={status}/>}
    {status.completed && typeof status.workedMinutes === 'number' && <p>Worked {formatHours(status.workedMinutes)} today</p>}
    {!isDesktop && !status.completed && (status.activeSession || status.canCheckIn) && <p>Use the FlowTask desktop app to check in and check out.</p>}
    {status.unresolvedMissedCheckout && <p>Missed checkout on {status.unresolvedMissedCheckout.workDateKey} · Regularize in Attendance</p>}
  </div> : null;
  let content;
  if (attendancePending && isDesktop) content = <button type="button" disabled aria-busy="true" className="welcome-action"><Loader2 size={15} className="animate-spin" />{busyLabel}</button>;
  else if (status.completed) content = <span className="welcome-attendance-label"><CheckCircle2 size={15} />Attendance Completed</span>;
  else if (status.activeSession) content = isDesktop ? <button type="button" disabled={isBusy} onClick={handleCheckOut} className="welcome-action"><LogOut size={15} />Check Out</button> : null;
  else if (status.canCheckIn) content = isDesktop ? <button type="button" disabled={isBusy} onClick={handleCheckIn} className="welcome-action"><LogIn size={15} />Check In</button> : null;
  else content = <span className="welcome-attendance-label"><MapPin size={15} />{friendlyBlockingLabel(status.blockingReason)}</span>;

  return <>
    {sessionError&&<p role="status" className="text-xs">{sessionError} <button type="button" className="underline" onClick={load}>Retry</button></p>}
    {sessionAction.phase==='RECONCILIATION_REQUIRED'&&<p role="alert" className="text-sm">{sessionAction.error} <button type="button" onClick={()=>sessionAction.recover()}>Verify status</button> <button type="button" onClick={()=>sessionAction.retry().catch(()=>{})}>Retry safely</button></p>}
    {status.activeSession
      ? <TrackingPanel compact attendanceHeader={modeControl} attendanceActions={content} attendanceDetails={attendanceDetails} attendanceWarning={Boolean(status.unresolvedMissedCheckout)} />
      : (content || !isDesktop || status.unresolvedMissedCheckout) && <div className="welcome-controls welcome-check-in">
          {content}
          {(status.completed || status.unresolvedMissedCheckout || !isDesktop) && attendanceDetails}
        </div>}
    {isDesktop && showCheckOut && <CheckOutConfirmationModal attendanceSessionId={status.activeSession?._id || checkoutSessionRef.current} onClose={()=>setShowCheckOut(false)} onInactive={checkoutInactive} onConfirm={confirmCheckOut} />}
    {isDesktop && showWorkSelection && <WorkSelectionModal checkingIn attendanceOnly={attendanceOnly} workModeControl={modeControl} onClose={closeWorkSelection} onConfirm={confirmCheckIn} />}
  </>;

};

function AttendanceElapsed({status}){
  if (!status.activeSession?.checkInAt) return null;
  const time = new Date(status.activeSession.checkInAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  return <p>Checked in · {time}</p>;
}

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
