import mongoose from 'mongoose';
import AuditLog from '../../models/AuditLog.js';
import { evaluateCheckout, assertCheckoutConfirmation } from './attendanceCheckout.service.js';
import { enqueueAttendanceEvent } from './attendanceEvents.service.js';
import { validateSelection, startWithAttendance, finalizeAttendanceWork } from '../tracking/tracking.service.js';
import AttendanceSession from './attendanceSession.model.js';
import AttendanceDay from './attendanceDay.model.js';
import AttendanceLocation from './attendanceLocation.model.js';
import AttendanceShift from './attendanceShift.model.js';
import AttendancePolicyVersion from './attendancePolicyVersion.model.js';
import AttendanceRegularization from './attendanceRegularization.model.js';
import { applyRegularizationOverlay } from './attendanceRegularizationOverlay.js';
import { resolveAttendanceEligibility } from './attendanceEligibility.service.js';
import { resolveApplicablePolicyVersion } from './attendancePolicy.service.js';
import { resolveApplicableShift, resolveWorkDateKey } from './attendanceShiftResolver.service.js';
import { resolveEligibleLocations, validateAttendanceGeofence, validateGpsQuality, logAttendanceLocationValidation } from './attendanceGeofence.service.js';
import { resolveAuthorizedWorkMode } from './attendanceWorkMode.service.js';
import { resolveEffectiveOfficeHours } from './attendanceOfficeHoursOverride.service.js';
import { resolveExpectedWorkingMinutes } from './attendanceExpectedMinutes.service.js';
import { resolveLeaveContextForDate } from './attendanceLeaveReconciliation.service.js';
import { resolveAttendanceStatus } from './attendanceStatusResolver.service.js';
import { resolveWorkspaceDay } from '../workCalendar/workCalendarFacade.js';
import { getWorkspaceTimezone, dateOnlyToInstant } from '../leave/leaveTimezone.util.js';
import { codedError } from './attendanceErrors.js';
import { friendlyAttendanceMessage } from './attendanceErrorMessages.js';
import {
  calculateMissedCheckoutCutoff,
  reconcileOverdueSessionsForUser,
  reconcileOverdueSession
} from './attendanceSessionLifecycle.service.js';
import * as attendanceHooks from './attendanceHooks.js';

/**
 * The check-in/check-out engine — spec §35-39's ordered resolution,
 * composed entirely from the dedicated resolvers built in Phase 4 (each
 * already independently tested). This file owns only: gathering their
 * outputs into one context, the transactional read-then-write, and the
 * handful of policy-driven accept/reject decisions that don't belong to
 * any single resolver (off-day behavior, full-day-leave behavior).
 *
 * Server time (`serverNow`) is captured exactly once per request and
 * threaded through everything — never re-read mid-flow, so every decision
 * in one request agrees on "now."
 */

function primaryDepartmentId(membership) {
  return membership?.department?.[0] || null;
}

/**
 * Resolves every fact needed to decide (or explain) today's attendance for
 * one member, WITHOUT mutating anything. `pinnedPolicyVersion`/`pinnedShift`
 * let a caller that already has a session's own snapshot (checkout,
 * regularization) recompute against THOSE frozen values instead of
 * whatever is "currently" active — never letting a same-day policy edit
 * reinterpret a session already in progress (spec §37, §74, §80-82).
 */
export async function resolveAttendanceContext({ workspaceId, userId, membership, workspace, pinnedPolicyVersion = null, pinnedShift = null, pinnedWorkDateKey = null, requestedWorkMode = null }) {
  const serverNow = new Date();
  const timezone = getWorkspaceTimezone(workspace);

  const preliminaryEligibility = await resolveAttendanceEligibility({ workspaceId, userId, membership, workspace });
  if (!preliminaryEligibility.attendanceRequired) {
    return { attendanceApplicable: false, eligibility: preliminaryEligibility, serverNow, timezone };
  }

  const policyVersion = pinnedPolicyVersion || await resolveApplicablePolicyVersion({ workspaceId });
  if (!policyVersion) {
    throw codedError(friendlyAttendanceMessage('POLICY_NOT_CONFIGURED'), 400, 'POLICY_NOT_CONFIGURED');
  }

  // Re-resolve with the policy loaded — excludedRoles/excludedUserIds are
  // policy-level extension points the preliminary pass couldn't see yet.
  const eligibility = await resolveAttendanceEligibility({ workspaceId, userId, membership, workspace, attendancePolicy: policyVersion });
  if (!eligibility.attendanceRequired) {
    return { attendanceApplicable: false, eligibility, serverNow, timezone };
  }

  const profile = eligibility.profile;
  const shift = pinnedShift !== null ? pinnedShift : await resolveApplicableShift({ workspaceId, userId, membership, date: serverNow, profile, policyVersion });
  const workDateKey = pinnedWorkDateKey || resolveWorkDateKey({ nowInstant: serverNow, timezone, shift });
  const dayInstant = dateOnlyToInstant(workDateKey, timezone);

  const calendar = await resolveWorkspaceDay({ workspaceId, date: dayInstant, departmentId: primaryDepartmentId(membership), timezone });
  const leave = await resolveLeaveContextForDate({ workspaceId, userId, dayInstant });
  const workModeResolution = await resolveAuthorizedWorkMode({ workspaceId, userId, membership, dayInstant, timezone, policyVersion, requestedWorkMode });
  const officeHours = await resolveEffectiveOfficeHours({ workspaceId, userId, membership, date: dayInstant, policyVersion, shift });

  const sessions = await AttendanceSession.find({ workspaceId, user: userId, workDateKey }).sort({ checkInAt: 1 }).lean();
  // Active-session detection must be date-agnostic, matching the REAL
  // concurrency guard: AttendanceSession's partial unique index is scoped
  // to {workspaceId, user} + status:'ACTIVE' only — it has no workDateKey
  // dimension at all (checkOut() itself queries it the same way, so an
  // open session from any day can always be closed). A session left open
  // from a PREVIOUS day (e.g. a forgotten check-out) would still collide
  // with that index on a fresh check-in attempt even though it's invisible
  // to the `sessions` lookup above (scoped to TODAY only) — if this
  // resolver didn't also check for it here, the status API would tell the
  // UI "you may check in," the write would then fail with a confusing
  // duplicate-key 409, and the employee would have no way to discover the
  // stale session to close it (canCheckOut below would also wrongly read
  // false). Checking today's sessions first avoids a second query on the
  // common case where today's own session (if any) is already the active one.
  const activeSession = sessions.find((s) => s.status === 'ACTIVE')
    || await AttendanceSession.findOne({ workspaceId, user: userId, status: 'ACTIVE' }).lean();

  const approvedRegularizations=await AttendanceRegularization.find({workspaceId,requester:userId,workDateKey,status:'APPROVED'}).sort({decidedAt:1,createdAt:1,_id:1}).lean();
  const effectiveSessions=applyRegularizationOverlay({sessions,approvedRegularizations});
  return {
    attendanceApplicable: true, eligibility, profile, serverNow, timezone, policyVersion, shift,
    workDateKey, dayInstant, calendar, leave, workModeResolution, officeHours, sessions:effectiveSessions, activeSession
  };
}

/** Every reason a NEW check-in could be refused, sourced once so the live "can I check in" preview (GET /me/today) and the real POST /check-in never disagree. */
function evaluateCheckInBlockers(ctx) {
  if (ctx.activeSession) {
    // Distinguishes "you're already checked in today" from "you forgot to
    // check out of a PREVIOUS day" — same underlying block, but a clearly
    // different message/code so the stale case is diagnosable instead of
    // looking like a same-day double-check-in (spec: future stale-session
    // issues must be easy to tell apart).
    const isStale = ctx.activeSession.workDateKey !== ctx.workDateKey;
    return { allowed: false, code: isStale ? 'STALE_ACTIVE_SESSION' : 'ALREADY_CHECKED_IN' };
  }
  if (ctx.sessions.some((s) => ['CLOSED', 'COMPLETED', 'MISSED_CHECKOUT'].includes(s.status))) return { allowed: false, code: 'ATTENDANCE_COMPLETED' };

  const isHoliday = ctx.calendar.dayType === 'HOLIDAY';
  if (isHoliday && ctx.policyVersion.holidayAttendanceBehavior === 'REJECT') {
    return { allowed: false, code: 'NON_WORKING_DAY' };
  }
  if (!isHoliday && !ctx.calendar.isWorkingDay && ctx.policyVersion.offDayAttendanceBehavior === 'REJECT') {
    return { allowed: false, code: 'NON_WORKING_DAY' };
  }
  if (ctx.leave.leaveState === 'FULL_LEAVE' && ctx.policyVersion.fullDayLeaveCheckInBehavior === 'REJECT') {
    return { allowed: false, code: 'FULL_DAY_LEAVE_ACTIVE' };
  }
  if (!ctx.workModeResolution.authorized) {
    return { allowed: false, code: ctx.workModeResolution.reason || 'WORK_MODE_NOT_AUTHORIZED' };
  }
  return { allowed: true, code: null };
}

/** Computes today's multi-dimensional status and upserts AttendanceDay to match — the one place either check-in or check-out writes that document. */
export async function computeAndUpsertDay({ workspaceId, userId, workDateKey, eligibility, timezone, calendar, leave, workModeResolution, policyVersion, shift, officeHours, sessions, serverNow, dbSession }) {
  const status = resolveAttendanceStatus({
    eligibility, timezone, calendar, leave, workModeResolution, policyVersion, shift, officeHours, sessions, serverNow, isDayOver: false, workDateKey
  });
  const day = await AttendanceDay.findOneAndUpdate(
    { user: userId, workDateKey }, // workspaceId deliberately omitted from the filter — workspaceScopePlugin injects it; see attendanceMemberProfile.service.js for why duplicating it here would break the upsert.
    {
      $set: {
        calendarDayType: status.calendarDayType, isCalendarWorkingDay: status.isCalendarWorkingDay,
        policyVersion: policyVersion._id, shift: shift?._id || null, workMode: status.workMode,
        firstCheckInAt: status.firstCheckInAt, lastCheckOutAt: status.lastCheckOutAt,
        workedMinutes: status.workedMinutes, shiftExpectedMinutes: status.shiftExpectedMinutes,
        lateMinutes: status.lateMinutes, earlyExitMinutes: status.earlyExitMinutes,
        effectiveOfficeHoursStart: status.effectiveOfficeHoursStart, effectiveOfficeHoursEnd: status.effectiveOfficeHoursEnd,
        effectiveOfficeHoursGraceMinutes: status.effectiveOfficeHoursGraceMinutes, effectiveOfficeHoursSource: status.effectiveOfficeHoursSource,
        presenceState: status.presenceState, punctualityState: status.punctualityState,
        leaveState: status.leaveState, presenceFraction: status.presenceFraction, leaveFraction: status.leaveFraction,
        exceptionFlags: status.exceptionFlags
      },
      $setOnInsert: { workspaceId, user: userId, workDateKey }
    },
    { upsert: true, new: true, session: dbSession, runValidators: true }
  );
  return { day, status };
}

/**
 * Recomputes AttendanceDay for a specific (possibly historical) business
 * date — called after an approved regularization changes what a day
 * should show, and by the daily finalization job (Phase 12). Pins to the
 * existing AttendanceDay's own policyVersion/shift snapshot when one
 * already exists (never lets a later policy edit reinterpret history);
 * falls back to resolving the CURRENT policy/shift only for a day that was
 * never actually attended at all (no prior Session/Day to snapshot from —
 * e.g. a MISSED_CHECK_IN regularization with zero raw evidence), which is
 * the best available approximation for a day that has no snapshot of its
 * own.
 *
 * ALWAYS applies any APPROVED regularizations for this exact date through
 * attendanceRegularizationOverlay.js before computing status — every
 * caller of this function (not just the regularization service itself)
 * automatically gets the same effective approved interval. Original session
 * evidence is preserved; successful application metadata is stored separately.
 */
export async function recomputeAttendanceDayForDate({ workspaceId, userId, membership, workspace, workDateKey, dbSession = null }) {
  const timezone = getWorkspaceTimezone(workspace);
  const dayInstant = dateOnlyToInstant(workDateKey, timezone);

  const existingDay = await AttendanceDay.findOne({ workspaceId, user: userId, workDateKey }).session(dbSession).lean();
  const policyVersion = existingDay?.policyVersion
    ? await AttendancePolicyVersion.findById(existingDay.policyVersion).session(dbSession).lean()
    : await resolveApplicablePolicyVersion({ workspaceId });
  if (!policyVersion) throw codedError(friendlyAttendanceMessage('POLICY_NOT_CONFIGURED'), 400, 'POLICY_NOT_CONFIGURED');

  const shift = existingDay?.shift
    ? await AttendanceShift.findById(existingDay.shift).session(dbSession).lean()
    : null;

  const eligibility = await resolveAttendanceEligibility({ workspaceId, userId, membership, workspace, attendancePolicy: policyVersion });
  const calendar = await resolveWorkspaceDay({ workspaceId, date: dayInstant, departmentId: primaryDepartmentId(membership), timezone, dbSession });
  const leave = await resolveLeaveContextForDate({ workspaceId, userId, dayInstant, dbSession });
  let workModeResolution = await resolveAuthorizedWorkMode({ workspaceId, userId, membership, dayInstant, timezone, policyVersion });
  // Resolved fresh, scoped to `dayInstant` — same treatment as
  // workModeResolution above, never pinned to a prior snapshot, since an
  // Office Hours Override is date-scoped (effectiveFrom/effectiveUntil)
  // the same way a Work Mode Override already is (spec §35: recompute
  // using the configuration applicable TO THAT DATE, not "current" state).
  const officeHours = await resolveEffectiveOfficeHours({ workspaceId, userId, membership, date: dayInstant, policyVersion, shift, dbSession });

  const rawSessions = await AttendanceSession.find({ workspaceId, user: userId, workDateKey }).session(dbSession).lean();
  const recordedMode = rawSessions.find(session=>session.checkIn?.workMode)?.checkIn.workMode;
  if(recordedMode && recordedMode !== 'HYBRID')workModeResolution={...workModeResolution,workMode:recordedMode,effectiveMode:recordedMode};
  const approvedRegularizations = await AttendanceRegularization.find({ workspaceId, requester: userId, workDateKey, status: 'APPROVED' }).sort({decidedAt:1,createdAt:1,_id:1}).session(dbSession).lean();
  const sessions = applyRegularizationOverlay({ sessions: rawSessions, approvedRegularizations });

  return computeAndUpsertDay({
    workspaceId, userId, workDateKey, eligibility: existingDay ? {...eligibility,attendanceRequired:true} : eligibility, timezone, calendar, leave, workModeResolution,
    policyVersion, shift, officeHours, sessions, serverNow: new Date(), dbSession
  });
}

/** Own status, including existing overdue reconciliation and targeted recovery
 * of already-approved corrections that predate resolution metadata. */
export async function getTodayStatus({ workspaceId, userId, membership, workspace }) {
  // Reconcile overdue sessions for this user on demand before querying status
  await reconcileOverdueSessionsForUser({ workspaceId, userId, workspace });

  const {repairApprovedMissedCheckoutsForUser}=await import('./attendanceRegularizationApplication.service.js');
  await repairApprovedMissedCheckoutsForUser({workspaceId,userId});

  const ctx = await resolveAttendanceContext({ workspaceId, userId, membership, workspace });
  if (!ctx.attendanceApplicable) {
    return { attendanceApplicable: false, attendanceRequired: false, reason: ctx.eligibility.reason };
  }

  const status = resolveAttendanceStatus({
    eligibility: ctx.eligibility, timezone: ctx.timezone, calendar: ctx.calendar, leave: ctx.leave,
    workModeResolution: ctx.workModeResolution, policyVersion: ctx.policyVersion, shift: ctx.shift, officeHours: ctx.officeHours,
    sessions: ctx.sessions, serverNow: ctx.serverNow, isDayOver: false, workDateKey: ctx.workDateKey
  });
  const checkInBlocker = evaluateCheckInBlockers(ctx);

  // Check for any unresolved missed checkout sessions
  const unresolvedMissedCheckout = await AttendanceSession.findOne({
    workspaceId,
    user: userId,
    status: 'MISSED_CHECKOUT',
    'regularizationResolution.appliedAt': null
  }).sort({ checkInAt: -1 }).lean();

  return {
    attendanceApplicable: true, attendanceRequired: true, workDateKey: ctx.workDateKey, ...status,
    activeSession: ctx.activeSession, completed: ctx.sessions.some((s) => ['CLOSED', 'COMPLETED'].includes(s.status)),
    canCheckIn: checkInBlocker.allowed, canCheckOut: Boolean(ctx.activeSession),
    blockingReason: checkInBlocker.allowed ? null : checkInBlocker.code,
    unresolvedMissedCheckout: unresolvedMissedCheckout ? {
      sessionId: unresolvedMissedCheckout._id,
      workDateKey: unresolvedMissedCheckout.workDateKey,
      checkInAt: unresolvedMissedCheckout.checkInAt,
      missedCheckoutCutoffAt: unresolvedMissedCheckout.missedCheckoutCutoffAt
    } : null,
    // So the client knows whether to even prompt for location permission
    // BEFORE attempting a check-in — never re-derived on the frontend.
    requiresGeofence: ctx.workModeResolution.requiresGeofence, requiresGps: ctx.workModeResolution.requiresGps,
    // Work Mode Override resolution (spec §22) — the frontend renders a
    // mode picker ONLY from allowedWorkModes it received here, never from
    // any static/local policy config; if it has only one entry, no picker
    // is shown at all and defaultWorkMode is used automatically.
    allowedWorkModes: ctx.workModeResolution.allowedWorkModes, defaultWorkMode: ctx.workModeResolution.defaultWorkMode,
    workModeSource: ctx.workModeResolution.workModeSource,
    // Informational only (new spec §33) — never fed back into presence/
    // duration tiering, which stays governed by shiftExpectedMinutes above.
    expectedWorkingMinutes: resolveExpectedWorkingMinutes({ workMode: status.workMode, officeHours: ctx.officeHours, calendar: ctx.calendar, shift: ctx.shift, leave: ctx.leave }),
    requirements: { officeRequiresGeofence: Boolean(ctx.policyVersion?.office?.requireCheckoutGeofence), wfhRequiresApproval: Boolean(ctx.policyVersion?.wfh?.requireApproval) }
  };
}

export async function checkIn({ workspaceId, userId, membership, workspace, gps = null, idempotencyKey = null, ipAddress = null, requestedWorkMode = null, actorName = null, workSelection = null }) {
  if (idempotencyKey) {
    const replay = await AttendanceSession.findOne({ workspaceId, user: userId, idempotencyKey }).lean();
    if (replay) return { session: replay, replay: true };
  }

  // Reconcile overdue sessions for this user on demand before check-in
  await reconcileOverdueSessionsForUser({ workspaceId, userId, workspace });

  const ctx = await resolveAttendanceContext({ workspaceId, userId, membership, workspace, requestedWorkMode });
  if (!ctx.attendanceApplicable) {
    throw codedError(friendlyAttendanceMessage('ATTENDANCE_NOT_REQUIRED'), 403, 'ATTENDANCE_NOT_REQUIRED');
  }

  const blocker = evaluateCheckInBlockers(ctx);
  if (!blocker.allowed) {
    throw codedError(friendlyAttendanceMessage(blocker.code), 400, blocker.code);
  }

  let evidence = {
    workMode: ctx.workModeResolution.workMode, location: null, coordinates: null, reportedAccuracyMeters: null,
    capturedAt: null, distanceMeters: null, allowedRadiusMeters: null, ipAddress
  };

  if (ctx.workModeResolution.requiresGeofence) {
    // Resolved BEFORE the coordinates check (not just on the happy path) so
    // the diagnostic log below always has "what office(s) were configured"
    // context, even when the client sent no location at all.
    const eligibleLocations = await resolveEligibleLocations({ workspaceId });
    const geofence = gps?.coordinates
      ? validateAttendanceGeofence({
        coordinates: gps.coordinates, reportedAccuracyMeters: gps.reportedAccuracyMeters, capturedAt: gps.capturedAt,
        eligibleLocations, gpsRequirements: ctx.policyVersion.gpsRequirements, nowInstant: ctx.serverNow
      })
      : { valid: false, code: 'LOCATION_PERMISSION_REQUIRED' };

    logAttendanceLocationValidation({
      action: 'CHECK-IN', userId, actorName, workspaceId, workMode: ctx.workModeResolution.workMode, gps,
      eligibleLocations, gpsRequirements: ctx.policyVersion.gpsRequirements, geofenceResult: geofence
    });

    if (!geofence.valid) throw codedError(friendlyAttendanceMessage(geofence.code), 400, geofence.code);
    // Denormalized here (not just referenced by id) so this session's
    // evidence stays fully explainable even after the location is later
    // renamed or deleted (deleteLocation is a soft-delete, never a hard
    // one, for exactly this reason — see attendanceLocation.model.js).
    const matchedLocation = eligibleLocations.find((l) => String(l._id) === String(geofence.locationId));
    evidence = {
      ...evidence, location: geofence.locationId, locationName: matchedLocation?.name || null, coordinates: gps.coordinates,
      reportedAccuracyMeters: gps.reportedAccuracyMeters, capturedAt: gps.capturedAt,
      distanceMeters: geofence.distanceMeters, allowedRadiusMeters: geofence.allowedRadiusMeters
    };
  } else if (ctx.workModeResolution.requiresGps) {
    // WFH (or any other non-geofenced mode) still requires GPS evidence
    // when the policy calls for it — validated for quality (accuracy/
    // freshness) but NEVER compared against an office location ("WFH Day
    // = Anywhere": no distance/geofence restriction ever applies here).
    if (!gps?.coordinates) throw codedError(friendlyAttendanceMessage('LOCATION_PERMISSION_REQUIRED'), 400, 'LOCATION_PERMISSION_REQUIRED');
    const quality = validateGpsQuality({
      coordinates: gps.coordinates, reportedAccuracyMeters: gps.reportedAccuracyMeters, capturedAt: gps.capturedAt,
      gpsRequirements: ctx.policyVersion.gpsRequirements, nowInstant: ctx.serverNow
    });
    if (!quality.valid) throw codedError(friendlyAttendanceMessage(quality.code), 400, quality.code);
    evidence = { ...evidence, coordinates: gps.coordinates, reportedAccuracyMeters: gps.reportedAccuracyMeters, capturedAt: gps.capturedAt };
  }

  const { missedCheckoutCutoffAt, effectiveShiftEndAt } = calculateMissedCheckoutCutoff({
    checkInAt: ctx.serverNow,
    workDateKey: ctx.workDateKey,
    timezone: ctx.timezone,
    policyVersion: ctx.policyVersion,
    shift: ctx.shift,
    officeHours: ctx.officeHours
  });

  const dbSession = await mongoose.startSession();
  let result;
  try {
    await dbSession.withTransaction(async () => {
      const selectedWork = await validateSelection({ workspaceId, userId, selection: workSelection, dbSession });
      // The Day shell must exist BEFORE the session so the session can
      // carry a real, permanent attendanceDay reference from the moment
      // it's created — AttendanceSession's immutability guard only allows
      // status/checkOut* to change after creation, so attendanceDay must
      // never need a follow-up write.
      const dayShell = await AttendanceDay.findOneAndUpdate(
        { user: userId, workDateKey: ctx.workDateKey },
        { $setOnInsert: { workspaceId, user: userId, workDateKey: ctx.workDateKey } },
        { upsert: true, new: true, session: dbSession }
      );

      let created;
      try {
        [created] = await AttendanceSession.create([{
          workspaceId, user: userId, attendanceDay: dayShell._id, workDateKey: ctx.workDateKey,
          status: 'ACTIVE', checkInAt: ctx.serverNow, checkIn: evidence,
          policyVersion: ctx.policyVersion._id, shift: ctx.shift?._id || null,
          missedCheckoutCutoffAt,
          effectiveShiftEndAt,
          idempotencyKey, createdBy: userId
        }], { session: dbSession });
      } catch (error) {
        if (error?.code === 11000) {
          const keys = Object.keys(error.keyPattern || {});
          // The idempotencyKey index collision is handled ONLY as a real
          // replay (the caller actually supplied a key we've seen before).
          // Root cause of the reported false "already checked in" on a
          // brand new day (confirmed via direct reproduction): this index
          // used to be declared `sparse: true`, but a COMPOUND sparse index
          // only excludes a document when EVERY indexed field is missing —
          // workspaceId/user always exist, so every check-in made with no
          // idempotencyKey (the frontend never sends one) stored a literal
          // `idempotencyKey: null`, and a user's SECOND such session ever
          // (any two days, active or already closed) collided with the
          // FIRST one on this index — a false conflict with no real active
          // session involved at all. Fixed structurally in
          // attendanceSession.model.js (partialFilterExpression instead of
          // sparse). If this branch's collision ever fires with no
          // idempotencyKey supplied, that fix has regressed — surface the
          // raw error loudly rather than re-mislabeling it ALREADY_CHECKED_IN.
          if (keys.includes('idempotencyKey')) {
            if (idempotencyKey) {
              const existing = await AttendanceSession.findOne({ workspaceId, user: userId, idempotencyKey }).session(dbSession).lean();
              result = { session: existing, replay: true };
              return;
            }
            throw error;
          }
          throw codedError(friendlyAttendanceMessage('ALREADY_CHECKED_IN'), 409, 'ALREADY_CHECKED_IN');
        }
        throw error;
      }

      const { day } = await computeAndUpsertDay({
        workspaceId, userId, workDateKey: ctx.workDateKey, eligibility: ctx.eligibility, timezone: ctx.timezone,
        calendar: ctx.calendar, leave: ctx.leave, workModeResolution: ctx.workModeResolution, policyVersion: ctx.policyVersion,
        shift: ctx.shift, officeHours: ctx.officeHours, sessions: [...ctx.sessions, created.toObject()], serverNow: ctx.serverNow, dbSession
      });
      await startWithAttendance({ attendance: created, selection: selectedWork, dbSession });
      await enqueueAttendanceEvent({workspaceId,user:userId,key:`checkin-${created._id}`,kind:'CHECKED_IN',attendanceSession:created._id,workDateKey:created.workDateKey},dbSession);
      result = { session: created, replay: false, attendanceDay: day };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally {
    await dbSession.endSession();
  }
  if (!result.replay) {
    try {
      attendanceHooks.onCheckedIn(userId, result.session, result.attendanceDay, []);
    } catch (error) { console.error('[Attendance] check-in realtime hook error:', error.message); }
  }
  return result;
}

export async function checkOut({ workspaceId, userId, membership, workspace, gps = null, ipAddress = null, actorName = null, attendanceSessionId = null, operationId = null, previewToken = null }) {
  const timezone = getWorkspaceTimezone(workspace);
  if (attendanceSessionId && !mongoose.isValidObjectId(attendanceSessionId)) throw codedError('Invalid attendance session',400,'INVALID_ATTENDANCE_SESSION');
  if (operationId !== null && (typeof operationId !== 'string' || !/^[\w-]{8,128}$/.test(operationId))) throw codedError('Invalid checkout operation',400,'INVALID_CHECKOUT_OPERATION');
  let overdueSessionToReconcile = null, result;
  const dbSession = await mongoose.startSession();
  try {
    await dbSession.withTransaction(async () => {
      const serverNow = new Date();
      let existing = await AttendanceSession.findOne({workspaceId,user:userId,...(attendanceSessionId?{_id:attendanceSessionId}:{status:'ACTIVE'})}).session(dbSession);
      if (!existing && !attendanceSessionId) {
        const recent = await AttendanceSession.findOne({workspaceId,user:userId}).sort({checkInAt:-1}).session(dbSession);
        if (recent && ['CLOSED','COMPLETED'].includes(recent.status) && recent.workDateKey === resolveWorkDateKey({nowInstant:serverNow,timezone,shift:null})) existing=recent;
      }
      if (!existing) throw codedError('No active attendance session. Refresh your attendance status.',409,'NO_ACTIVE_SESSION');
      if (['CLOSED','COMPLETED'].includes(existing.status)) {
        await finalizeAttendanceWork(existing,dbSession);
        result={session:existing,replay:true,summary:existing.checkoutSummary||null};return;
      }
      if (existing.status !== 'ACTIVE') throw codedError(friendlyAttendanceMessage('MISSED_CHECKOUT_EXPIRED'),409,'MISSED_CHECKOUT_EXPIRED');
      // Leave approvals/cancellations update this same row in their transaction.
      await AttendanceDay.updateOne({_id:existing.attendanceDay,workspaceId},{$inc:{evaluationRevision:1}},{session:dbSession});
      const evaluation = await evaluateCheckout({workspaceId,userId,membership,workspace,attendance:existing.toObject(),at:serverNow,dbSession});
      const {policyVersion,shift}=evaluation.context;
      const cutoff=existing.missedCheckoutCutoffAt || calculateMissedCheckoutCutoff({checkInAt:existing.checkInAt,workDateKey:existing.workDateKey,timezone,policyVersion,shift,officeHours:evaluation.context.officeHours}).missedCheckoutCutoffAt;
      if (+serverNow >= +new Date(cutoff)) { overdueSessionToReconcile=existing;throw codedError(friendlyAttendanceMessage('MISSED_CHECKOUT_EXPIRED'),409,'MISSED_CHECKOUT_EXPIRED'); }
      assertCheckoutConfirmation(previewToken,evaluation,userId,workspaceId);
      let checkOutEvidence = {
        workMode: existing.checkIn.workMode, location: null, coordinates: null, reportedAccuracyMeters: null,
        capturedAt: null, distanceMeters: null, allowedRadiusMeters: null, ipAddress
      };

      // Checkout geofence validates ONLY against the exact location
      // captured at check-in (never a freshly re-resolved eligible-
      // locations list) — a location deactivated or reassigned mid-session
      // must never trap the employee at checkout (spec §37, §80).
      const checkoutNeedsGeofence = Boolean(existing.checkIn.location) && policyVersion?.office?.requireCheckoutGeofence;
      if (checkoutNeedsGeofence) {
        const checkInLocation = await AttendanceLocation.findById(existing.checkIn.location).session(dbSession).lean();
        const eligibleLocationsForLog = checkInLocation ? [checkInLocation] : [];
        const geofence = gps?.coordinates
          ? validateAttendanceGeofence({
            coordinates: gps.coordinates, reportedAccuracyMeters: gps.reportedAccuracyMeters, capturedAt: gps.capturedAt,
            eligibleLocations: eligibleLocationsForLog,
            gpsRequirements: policyVersion.gpsRequirements, nowInstant: serverNow
          })
          : { valid: false, code: 'LOCATION_PERMISSION_REQUIRED' };

        logAttendanceLocationValidation({
          action: 'CHECK-OUT', userId, actorName, workspaceId, workMode: existing.checkIn.workMode, gps,
          eligibleLocations: eligibleLocationsForLog, gpsRequirements: policyVersion.gpsRequirements, geofenceResult: geofence
        });

        if (!geofence.valid) throw codedError(friendlyAttendanceMessage(geofence.code), 400, geofence.code);
        checkOutEvidence = {
          ...checkOutEvidence, location: geofence.locationId, locationName: checkInLocation?.name || null, coordinates: gps.coordinates,
          reportedAccuracyMeters: gps.reportedAccuracyMeters, capturedAt: gps.capturedAt,
          distanceMeters: geofence.distanceMeters, allowedRadiusMeters: geofence.allowedRadiusMeters
        };
      } else if (gps?.coordinates) {
        // Non-geofenced check-out (e.g. WFH) — GPS is optional evidence
        // here, never mandatory ("GPS may be captured for evidence/
        // context"), so a quality failure just means no evidence is
        // stored, never a blocked check-out. It's still validated rather
        // than stored blindly: stale/inaccurate coordinates are worse
        // than none at all.
        const quality = validateGpsQuality({
          coordinates: gps.coordinates, reportedAccuracyMeters: gps.reportedAccuracyMeters, capturedAt: gps.capturedAt,
          gpsRequirements: policyVersion.gpsRequirements, nowInstant: serverNow
        });
        if (quality.valid) {
          checkOutEvidence = { ...checkOutEvidence, coordinates: gps.coordinates, reportedAccuracyMeters: gps.reportedAccuracyMeters, capturedAt: gps.capturedAt };
        }
      }


      const {context:_,fingerprint:__,...summary}=evaluation;
      const closed=await AttendanceSession.findOneAndUpdate({_id:existing._id,workspaceId,user:userId,status:'ACTIVE'},{$set:{status:'COMPLETED',closureReason:'NORMAL_CHECKOUT',checkOutAt:serverNow,checkOut:checkOutEvidence,checkoutOperationId:operationId,checkoutSummary:summary}},{new:true,session:dbSession});
      if(!closed)throw codedError('Attendance changed concurrently. Retry checkout.',409,'ATTENDANCE_CHANGED');
      const {day}=await computeAndUpsertDay({...evaluation.context,dbSession});
      await finalizeAttendanceWork(closed,dbSession);
      await AuditLog.create([{workspace:workspaceId,actor:userId,actorName,actorRole:membership.role,action:'ATTENDANCE_CHECKED_OUT',category:'attendance_management',targetType:'AttendanceSession',targetId:closed._id,
        resourceLabel:`Attendance check-out: ${actorName||'Employee'}`,summary:`${actorName||'Employee'} checked out`,changes:{after:{workDateKey:closed.workDateKey,checkOutAt:serverNow,policyVersion:policyVersion._id,outcome:summary.outcome,approvedLeaveIds:summary.approvedLeaves.map(l=>l.requestId)}}}],{session:dbSession});
      await enqueueAttendanceEvent({workspaceId,user:userId,key:`checkout-${closed._id}`,kind:'CHECKED_OUT',attendanceSession:closed._id,workDateKey:closed.workDateKey},dbSession);
      result={session:closed,replay:false,attendanceDay:day,summary};
    },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});
  } catch(error) {
    if(overdueSessionToReconcile)await reconcileOverdueSession({session:overdueSessionToReconcile,workspace,reason:'LATE_CHECKOUT_ATTEMPT'}).catch(e=>console.error('[Attendance] overdue checkout recovery:',e.message));
    throw error;
  } finally {await dbSession.endSession();}
  // Transport delivery is recoverable; a committed checkout is never reopened.
  // The durable outbox is drained by existing maintenance/BullMQ workers.
  // Observer authorization and transport retries must not hold the response.
  if(!result.replay)try{attendanceHooks.onCheckedOut(userId,result.session,result.attendanceDay,[]);}catch{/* durable retry */}
  return result;
}
