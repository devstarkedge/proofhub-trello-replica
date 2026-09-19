import { DateTime } from 'luxon';
import WfhRequest from './wfhRequest.model.js';
import { resolveEffectiveWorkModePolicy } from './attendanceWorkModeOverride.service.js';

/**
 * Resolves Office/WFH/Hybrid/Field authorization server-side (spec §7-11,
 * plus the Work Mode Override upgrade). Two independent questions, always
 * resolved in this order:
 *   1. WHICH modes is this employee even allowed to use today, and which
 *      one applies if they don't pick (resolveEffectiveWorkModePolicy —
 *      USER > DEPARTMENT > ROLE > workspace-default overrides).
 *   2. Given the mode that applies, does it actually authorize a check-in
 *      right now (workspace policy toggles, WFH approval, Hybrid schedule,
 *      Field assignment) — an allowed mode is NOT automatically an
 *      authorized one (spec §14).
 * The client MAY suggest a `requestedWorkMode` when more than one mode is
 * allowed (spec §21's "show a small selection"), but it is only ever a
 * hint validated against step 1's resolved set — never trusted outright.
 */

/** True if an APPROVED WfhRequest exists covering this workDateKey — an ad hoc WFH day, not a permanent WFH assignment. */
export async function hasApprovedWfhForDate({ workspaceId, userId, dayInstant }) {
  const request = await WfhRequest.findOne({
    workspaceId, requester: userId, status: 'APPROVED',
    startDate: { $lte: dayInstant }, endDate: { $gte: dayInstant }
  }).lean();
  return Boolean(request);
}

/** Luxon weekday (1=Mon..7=Sun) converted to the Date#getDay() convention (0=Sun..6=Sat) used by fixedOfficeDaysOfWeek/fixedWfhDaysOfWeek. */
function jsDayOfWeek(dayInstant, timezone) {
  const weekday = DateTime.fromJSDate(dayInstant, { zone: 'utc' }).setZone(timezone).weekday;
  return weekday === 7 ? 0 : weekday;
}

function resolveHybridEffectiveMode({ hybrid, dayInstant, timezone, approvedWfhToday }) {
  if (hybrid.scheduleMode === 'APPROVED_WFH_DATES') {
    return approvedWfhToday ? 'WFH' : 'OFFICE';
  }
  const jsDay = jsDayOfWeek(dayInstant, timezone);
  if ((hybrid.fixedOfficeDaysOfWeek || []).includes(jsDay)) return 'OFFICE';
  if ((hybrid.fixedWfhDaysOfWeek || []).includes(jsDay)) return 'WFH';
  // Ambiguous day (neither list names it) — default to the more strictly
  // verifiable state rather than silently granting an un-geofenced day.
  return 'OFFICE';
}

async function authorizeMode({ baseMode, workspaceId, userId, dayInstant, timezone, policyVersion }) {
  if (baseMode === 'FIELD') {
    if (!policyVersion?.field?.enabled) {
      return { workMode: 'FIELD', authorized: false, reason: 'WORK_MODE_NOT_AUTHORIZED', requiresGeofence: false, requiresGps: false, effectiveMode: 'FIELD' };
    }
    const requiresGeofence = Boolean(policyVersion.field.requireGeofence);
    return { workMode: 'FIELD', authorized: true, reason: null, requiresGeofence, requiresGps: requiresGeofence, effectiveMode: 'FIELD' };
  }

  if (baseMode === 'WFH') {
    if (!policyVersion?.wfh?.enabled) {
      return { workMode: 'WFH', authorized: false, reason: 'WORK_MODE_NOT_AUTHORIZED', requiresGeofence: false, requiresGps: false, effectiveMode: 'WFH' };
    }
    // A permanently-allowed WFH mode is itself the authorization (an
    // HR/admin decision already made and audited via the override) — no
    // fresh per-day WfhRequest is required, unlike an ad hoc WFH day
    // requested by an otherwise-Office employee (see hasApprovedWfhForDate
    // usage under HYBRID below, the one case that still needs it).
    const requiresGps = Boolean(policyVersion.wfh.requireGps);
    return { workMode: 'WFH', authorized: true, reason: null, requiresGeofence: false, requiresGps, effectiveMode: 'WFH' };
  }

  if (baseMode === 'HYBRID') {
    if (!policyVersion?.hybrid?.enabled) {
      return { workMode: 'HYBRID', authorized: false, reason: 'WORK_MODE_NOT_AUTHORIZED', requiresGeofence: false, requiresGps: false, effectiveMode: null };
    }
    return resolveHybridAuthorization({ workspaceId, userId, dayInstant, timezone, policyVersion });
  }

  // Default: OFFICE — always authorized (no approval gate), always geofenced.
  return { workMode: 'OFFICE', authorized: true, reason: null, requiresGeofence: true, requiresGps: true, effectiveMode: 'OFFICE' };
}

async function resolveHybridAuthorization({ workspaceId, userId, dayInstant, timezone, policyVersion }) {
  const approvedWfhToday = await hasApprovedWfhForDate({ workspaceId, userId, dayInstant });
  const effectiveMode = resolveHybridEffectiveMode({ hybrid: policyVersion.hybrid, dayInstant, timezone, approvedWfhToday });

  if (effectiveMode === 'WFH') {
    if (policyVersion.hybrid.scheduleMode === 'APPROVED_WFH_DATES' && policyVersion.wfh?.requireApproval && !approvedWfhToday) {
      return { workMode: 'HYBRID', authorized: false, reason: 'WFH_NOT_APPROVED', requiresGeofence: false, requiresGps: false, effectiveMode };
    }
    const requiresGps = Boolean(policyVersion.wfh?.requireGps);
    return { workMode: 'HYBRID', authorized: true, reason: null, requiresGeofence: false, requiresGps, effectiveMode };
  }
  return { workMode: 'HYBRID', authorized: true, reason: null, requiresGeofence: true, requiresGps: true, effectiveMode: 'OFFICE' };
}

/**
 * The single entry point the check-in engine (and the /me/today read)
 * calls. Returns everything authorizeMode() returns, plus:
 *  - allowedWorkModes / workModeSource: the resolved override result, for
 *    the API response (spec §22) and for the frontend's mode picker.
 * `requestedWorkMode` is optional — omit it to auto-use the resolved
 * defaultMode (the common case: only one mode allowed, or the employee
 * hasn't chosen). When provided, it is validated against allowedWorkModes
 * and REJECTED (not silently corrected) if it isn't actually allowed.
 */
export async function resolveAuthorizedWorkMode({ workspaceId, userId, membership, dayInstant, timezone, policyVersion, requestedWorkMode = null }) {
  const { allowedWorkModes, defaultMode, source } = await resolveEffectiveWorkModePolicy({
    workspaceId, userId, membership, policyVersion, date: dayInstant
  });

  if (requestedWorkMode && !allowedWorkModes.includes(requestedWorkMode)) {
    return {
      workMode: requestedWorkMode, authorized: false, reason: 'WORK_MODE_NOT_ALLOWED',
      requiresGeofence: false, requiresGps: false, effectiveMode: null,
      allowedWorkModes, defaultWorkMode: defaultMode, workModeSource: source
    };
  }

  const baseMode = requestedWorkMode || defaultMode;
  const authorization = await authorizeMode({ baseMode, workspaceId, userId, dayInstant, timezone, policyVersion });
  return { ...authorization, allowedWorkModes, defaultWorkMode: defaultMode, workModeSource: source };
}
