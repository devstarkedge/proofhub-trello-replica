/**
 * Applies approved regularizations on top of a day's real sessions —
 * purely in memory, never mutating or persisting a change to any real
 * AttendanceSession document (spec §34, §54: raw evidence is preserved
 * forever; a correction is a layer the resolver applies on top). The
 * caller feeds the result into resolveAttendanceStatus exactly like the
 * real sessions list — the resolver itself has no idea a correction was
 * involved.
 *
 * `finalCorrection` shape: `{ checkInAt: ISOString|null, checkOutAt: ISOString|null }`
 * — whatever the regularization TYPE was about (missed check-in, wrong
 * time, forgotten attendance...), the one thing that actually changes the
 * computed day is "what should checkInAt/checkOutAt have been," so every
 * type shares this one correction shape rather than needing a type-specific
 * branch here.
 */
export function correctedAttendanceInterval(session, correction = {}) {
  const checkInAt = correction.checkInAt ? new Date(correction.checkInAt) : new Date(session.checkInAt);
  const end = correction.checkOutAt !== undefined ? correction.checkOutAt : session.checkOutAt;
  const checkOutAt = end ? new Date(end) : null;
  if (!Number.isFinite(+checkInAt) || checkOutAt && (!Number.isFinite(+checkOutAt) || +checkOutAt <= +checkInAt)) {
    const error = new Error('Corrected check-out must be a valid time after check-in');
    Object.assign(error,{statusCode:400,code:'REGULARIZATION_INVALID_INTERVAL'});throw error;
  }
  return {checkInAt,checkOutAt};
}
export function effectiveAttendanceSession(session) {
  const resolution=session.regularizationResolution;
  if(!resolution?.appliedAt||!resolution.checkInAt||!resolution.checkOutAt)return {...session};
  return {...session,...correctedAttendanceInterval(session,resolution),status:'CLOSED',regularized:true};
}
export function applyRegularizationOverlay({ sessions, approvedRegularizations }) {
  const approved=approvedRegularizations.filter(r=>!r.status||r.status==='APPROVED');
  const linked=new Set(approved.map(r=>String(r.attendanceSession||'')));
  const result = sessions.map(s=>linked.has(String(s._id))?{...s}:effectiveAttendanceSession(s));

  for (const regularization of approved) {
    const correction = regularization.finalCorrection || {};
    const targetIndex = regularization.attendanceSession
      ? result.findIndex((s) => String(s._id) === String(regularization.attendanceSession))
      : -1;

    if (targetIndex >= 0) {
      const target = result[targetIndex];
      const interval=correctedAttendanceInterval(target,correction);
      result[targetIndex] = {
        ...target,
        ...interval,
        status: interval.checkOutAt ? 'CLOSED' : target.status,
        regularized: true
      };
      continue;
    }

    // No existing session to correct (MISSED_CHECK_IN / FORGOTTEN_ATTENDANCE
    // — the raw evidence for this event never existed at all) — the
    // approved correction becomes a wholly synthetic session for
    // computation purposes only.
    if (!regularization.attendanceSession && correction.checkInAt) {
      result.push({
        ...correctedAttendanceInterval({},correction),
        status: correction.checkOutAt ? 'CLOSED' : 'ACTIVE',
        systemGeneratedCheckout: false,
        regularized: true
      });
    }
  }

  return result;
}
