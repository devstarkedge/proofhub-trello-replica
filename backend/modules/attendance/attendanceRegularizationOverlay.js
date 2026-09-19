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
export function applyRegularizationOverlay({ sessions, approvedRegularizations }) {
  const result = sessions.map((s) => ({ ...s }));

  for (const regularization of approvedRegularizations) {
    const correction = regularization.finalCorrection || {};
    const targetIndex = regularization.attendanceSession
      ? result.findIndex((s) => String(s._id) === String(regularization.attendanceSession))
      : -1;

    if (targetIndex >= 0) {
      const target = result[targetIndex];
      result[targetIndex] = {
        ...target,
        checkInAt: correction.checkInAt ? new Date(correction.checkInAt) : target.checkInAt,
        checkOutAt: correction.checkOutAt !== undefined
          ? (correction.checkOutAt ? new Date(correction.checkOutAt) : null)
          : target.checkOutAt,
        status: correction.checkOutAt || target.checkOutAt ? 'CLOSED' : target.status,
        regularized: true
      };
      continue;
    }

    // No existing session to correct (MISSED_CHECK_IN / FORGOTTEN_ATTENDANCE
    // — the raw evidence for this event never existed at all) — the
    // approved correction becomes a wholly synthetic session for
    // computation purposes only.
    if (correction.checkInAt) {
      result.push({
        checkInAt: new Date(correction.checkInAt),
        checkOutAt: correction.checkOutAt ? new Date(correction.checkOutAt) : null,
        status: correction.checkOutAt ? 'CLOSED' : 'ACTIVE',
        systemGeneratedCheckout: false,
        regularized: true
      });
    }
  }

  return result;
}
