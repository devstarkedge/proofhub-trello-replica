import mongoose from 'mongoose';
import { finalizeAttendanceWork } from '../tracking/tracking.service.js';
import { DateTime } from 'luxon';
import AttendanceSession from './attendanceSession.model.js';
import AttendanceDay from './attendanceDay.model.js';
import AttendancePolicyVersion from './attendancePolicyVersion.model.js';
import AttendanceShift from './attendanceShift.model.js';
import Workspace from '../../models/Workspace.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import { resolveEffectiveOfficeHours } from './attendanceOfficeHoursOverride.service.js';
import { recomputeAttendanceDayForDate } from './attendance.service.js';
import { getWorkspaceTimezone, dateOnlyToInstant } from '../leave/leaveTimezone.util.js';
import * as attendanceHooks from './attendanceHooks.js';
import * as workspaceContext from '../workspaces/workspaceContext.js';
import { getActiveWorkspaceId } from '../workspaces/workspaceContext.js';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';

/**
 * Enterprise Attendance Session Lifecycle & Cutoff Engine.
 *
 * Implements deterministic, policy-aware missed-checkout cutoffs,
 * preventing unverified elapsed time from inflating attendance records.
 *
 * Supports:
 * - Normal scheduled shifts (same-day start/end + grace)
 * - Overnight shifts (cross-midnight, month-end, year-end, DST-aware)
 * - Flexible schedules & unassigned shifts (max session duration guardrail)
 * - User/Department/Role policy override hierarchy
 * - Multi-tenant isolation & atomic conditional updates
 */

const DEFAULT_CUTOFF_GRACE_MINUTES = 60;
const DEFAULT_MAX_SESSION_HOURS = 16;

/**
 * Calculates the exact UTC instant at which an attendance session must be
 * flagged/closed as a missed checkout if no valid check-out was received.
 *
 * @param {Object} params
 * @param {Date|string} params.checkInAt - Actual check-in timestamp
 * @param {string} params.workDateKey - 'YYYY-MM-DD' attendance workday
 * @param {string} params.timezone - Workspace IANA timezone
 * @param {Object} params.policyVersion - Resolved AttendancePolicyVersion
 * @param {Object} [params.shift] - Resolved AttendanceShift
 * @param {Object} [params.officeHours] - Resolved Office Hours from override chain
 * @returns {{ effectiveShiftEndAt: Date|null, missedCheckoutCutoffAt: Date }}
 */
export function calculateMissedCheckoutCutoff({
  checkInAt,
  workDateKey,
  timezone,
  policyVersion,
  shift = null,
  officeHours = null
}) {
  const checkInDate = checkInAt instanceof Date ? checkInAt : new Date(checkInAt);
  const tz = timezone || 'UTC';

  // 1. Resolve grace & max session limits from effective officeHours or policy
  const cutoffGraceMinutes = officeHours?.cutoffGraceMinutes
    ?? policyVersion?.missingCheckout?.cutoffGraceMinutes
    ?? DEFAULT_CUTOFF_GRACE_MINUTES;

  const rawMaxSessionHours = officeHours?.maxSessionDurationHours
    ?? policyVersion?.missingCheckout?.maxSessionDurationHours
    ?? DEFAULT_MAX_SESSION_HOURS;
  const maxSessionDurationHours = Math.min(24, Math.max(1, rawMaxSessionHours));

  const guardrailLimitMs = checkInDate.getTime() + (maxSessionDurationHours * 60 * 60 * 1000);

  // 2. Resolve start/end local times ('HH:mm')
  const startLocalTime = officeHours?.startLocalTime || shift?.startLocalTime || shift?.startTime || null;
  const endLocalTime = officeHours?.endLocalTime || shift?.endLocalTime || shift?.endTime || null;

  let effectiveShiftEndAt = null;
  let cutoffInstant = null;

  if (endLocalTime && startLocalTime) {
    const isOvernight = endLocalTime <= startLocalTime;
    const baseDt = DateTime.fromISO(workDateKey, { zone: tz });

    const [endH, endM] = endLocalTime.split(':').map(Number);
    const shiftEndDt = isOvernight
      ? baseDt.plus({ days: 1 }).set({ hour: endH, minute: endM, second: 0, millisecond: 0 })
      : baseDt.set({ hour: endH, minute: endM, second: 0, millisecond: 0 });

    effectiveShiftEndAt = shiftEndDt.toJSDate();

    // Cutoff = Shift End + Cutoff Grace Minutes
    const cutoffDt = shiftEndDt.plus({ minutes: Math.max(0, cutoffGraceMinutes) });
    cutoffInstant = cutoffDt.toJSDate();
  } else if (policyVersion?.missingCheckout?.autoCloseAtLocalTime) {
    // Configured daily auto-close local time (e.g. '23:59')
    const [autoH, autoM] = policyVersion.missingCheckout.autoCloseAtLocalTime.split(':').map(Number);
    let autoCloseDt = DateTime.fromISO(workDateKey, { zone: tz }).set({ hour: autoH, minute: autoM, second: 0, millisecond: 0 });
    if (autoCloseDt.toJSDate().getTime() <= checkInDate.getTime()) {
      autoCloseDt = autoCloseDt.plus({ days: 1 });
    }
    cutoffInstant = autoCloseDt.toJSDate();
  } else {
    // Flexible shift fallback: checkInAt + maxSessionDurationHours
    cutoffInstant = new Date(guardrailLimitMs);
  }

  // 3. Apply guardrails:
  // - Cutoff cannot be in the past relative to checkInAt
  // - Cutoff cannot exceed checkInAt + maxSessionDurationHours
  let finalCutoffTime = Math.max(checkInDate.getTime() + (5 * 60 * 1000), cutoffInstant.getTime());
  if (finalCutoffTime > guardrailLimitMs) {
    finalCutoffTime = guardrailLimitMs;
  }

  return {
    effectiveShiftEndAt,
    missedCheckoutCutoffAt: new Date(finalCutoffTime)
  };
}

/**
 * Safely and idempotently reconciles an overdue active session into MISSED_CHECKOUT.
 * Ensures verified working hours stop accumulating and AttendanceDay reflects MISSING_CHECKOUT.
 *
 * @param {Object} params
 * @param {Object} params.session - AttendanceSession document or lean object
 * @param {Object} [params.workspace] - Optional loaded Workspace doc
 * @param {Object} [params.dbSession] - Optional MongoDB transaction session
 * @param {string} [params.reason] - Closure reason
 * @returns {Promise<Object|null>} Updated session, or null if already closed
 */
// Tracking closes at the existing policy cutoff; attendance status remains policy-owned.
export async function reconcileOverdueSession({
  session,
  workspace = null,
  dbSession = null,
  reason = 'MISSED_CHECKOUT_CUTOFF'
}) {
  if (!session || session.status !== 'ACTIVE') return session;

  const targetWsId = session.workspaceId;
  const execute = async () => {
    const now = new Date();

    // Atomic conditional update ensures only one transition wins against concurrent checkouts or workers
    const updated = await AttendanceSession.findOneAndUpdate(
      { _id: session._id, workspaceId: targetWsId, status: 'ACTIVE' },
      {
        $set: {
          status: 'MISSED_CHECKOUT',
          closureReason: reason,
          systemGeneratedCheckout: true,
          reconciledAt: now,
          missedCheckoutDetectedAt: now,
          checkOutAt: null // Explicitly ensure no arbitrary checkout timestamp is recorded
        }
      },
      { session: dbSession, new: true }
    );

    if (!updated) {
      // Another worker or a legitimate concurrent checkout already transitioned this session
      return null;
    }

    await finalizeAttendanceWork(updated, dbSession);
    const workspaceDoc = workspace || await Workspace.findById(targetWsId).select('attendanceModuleEnabled timezone').session(dbSession).lean();
    const membership = await WorkspaceMembership.findOne({ workspace: targetWsId, user: session.user }).session(dbSession).lean();

    // Recompute AttendanceDay so presenceState becomes MISSING_CHECKOUT and workedMinutes is 0
    let day = null;
    try {
      const recomputed = await recomputeAttendanceDayForDate({
        workspaceId: targetWsId,
        userId: session.user,
        membership,
        workspace: workspaceDoc,
        workDateKey: session.workDateKey,
        dbSession
      });
      day = recomputed?.day || null;
    } catch (err) {
      logger.error('[AttendanceLifecycle] Error recomputing AttendanceDay on missed checkout reconciliation:', {
        error: err.message,
        sessionId: session._id,
        workDateKey: session.workDateKey,
        workspaceId: targetWsId
      });
    }

    // Realtime notification hook
    try {
      attendanceHooks.onMissedCheckoutDetected(updated, day);
    } catch (err) {
      logger.warn('[AttendanceLifecycle] Missed checkout hook error (non-fatal):', { error: err.message });
    }

    return updated;
  };

  if (String(getActiveWorkspaceId()) !== String(targetWsId)) {
    return await workspaceContext.run({ workspaceId: targetWsId }, async () => await execute());
  }
  return await execute();
}

/**
 * Reconciles any overdue active sessions for a specific user in a workspace.
 * Invoked on-demand before authoritative operations (GET /me/today, POST /check-in, POST /check-out)
 * to guarantee resilience even if background jobs are delayed.
 *
 * @param {Object} params
 * @param {string|ObjectId} params.workspaceId
 * @param {string|ObjectId} params.userId
 * @param {Object} [params.workspace]
 * @returns {Promise<Array<Object>>} List of reconciled sessions
 */
export async function reconcileOverdueSessionsForUser({ workspaceId, userId, workspace = null }) {
  const execute = async () => {
    const activeSessions = await AttendanceSession.find({
      workspaceId,
      user: userId,
      status: 'ACTIVE'
    }).lean();

    if (!activeSessions.length) return [];

    const workspaceDoc = workspace || await Workspace.findById(workspaceId).select('attendanceModuleEnabled timezone').lean();
    const timezone = getWorkspaceTimezone(workspaceDoc);
    const now = new Date();

    const membership = await WorkspaceMembership.findOne({ workspace: workspaceId, user: userId }).lean();
    const defaultPolicyVersion = await AttendancePolicyVersion.findOne({
      workspaceId,
      status: { $in: ['active', 'published'] }
    }).lean();

    const reconciled = [];
    for (const session of activeSessions) {
      let cutoff = session.missedCheckoutCutoffAt;
      let effectiveShiftEndAt = session.effectiveShiftEndAt;

      // Backfill cutoff if missing on legacy active sessions
      if (!cutoff) {
        const policyVersion = session.policyVersion
          ? await AttendancePolicyVersion.findById(session.policyVersion).lean() || defaultPolicyVersion
          : defaultPolicyVersion;
        const shift = session.shift ? await AttendanceShift.findById(session.shift).lean() : null;
        const dayInstant = dateOnlyToInstant(session.workDateKey, timezone);
        const officeHours = await resolveEffectiveOfficeHours({
          workspaceId,
          userId,
          membership,
          date: dayInstant,
          policyVersion,
          shift
        });

        const resolved = calculateMissedCheckoutCutoff({
          checkInAt: session.checkInAt,
          workDateKey: session.workDateKey,
          timezone,
          policyVersion,
          shift,
          officeHours
        });
        cutoff = resolved.missedCheckoutCutoffAt;
        effectiveShiftEndAt = resolved.effectiveShiftEndAt;

        // If cutoff is in the future, backfill onto active session
        if (cutoff && now.getTime() < new Date(cutoff).getTime()) {
          await AttendanceSession.updateOne(
            { _id: session._id, workspaceId, status: 'ACTIVE', missedCheckoutCutoffAt: null },
            { $set: { missedCheckoutCutoffAt: cutoff, effectiveShiftEndAt: effectiveShiftEndAt || null } }
          );
        }
      }

      const isCutoffExpired = cutoff && now.getTime() >= new Date(cutoff).getTime();

      if (isCutoffExpired) {
        const rec = await reconcileOverdueSession({ session, workspace: workspaceDoc });
        if (rec) reconciled.push(rec);
      }
    }

    return reconciled;
  };

  if (String(getActiveWorkspaceId()) !== String(workspaceId)) {
    return await workspaceContext.run({ workspaceId }, async () => await execute());
  }
  return await execute();
}

/**
 * Reconciles overdue sessions for a single workspace, strictly scoped within workspaceContext.run().
 *
 * @param {string|ObjectId} workspaceId
 * @param {Object} [options]
 * @param {number} [options.limit=100]
 * @param {Date} [options.now=new Date()]
 * @returns {Promise<{ scanned: number, reconciled: number }>}
 */
export async function reconcileWorkspaceOverdueSessions(workspaceId, { limit = 100, now = new Date() } = {}) {
  return await workspaceContext.run({ workspaceId }, async () => {
    const workspaceDoc = await Workspace.findById(workspaceId)
      .select('attendanceModuleEnabled timezone status')
      .lean();

    const timezone = getWorkspaceTimezone(workspaceDoc);

    const query = {
      status: 'ACTIVE',
      $or: [
        { missedCheckoutCutoffAt: { $lte: now, $ne: null } },
        // Legacy open sessions with no cutoff populated
        { missedCheckoutCutoffAt: null }
      ]
    };

    const overdueCandidates = await AttendanceSession.find(query)
      .sort({ checkInAt: 1 })
      .limit(limit)
      .lean();

    let reconciledCount = 0;
    const defaultPolicyVersion = await AttendancePolicyVersion.findOne({
      workspaceId,
      status: { $in: ['active', 'published'] }
    }).lean();

    for (const session of overdueCandidates) {
      try {
        let cutoff = session.missedCheckoutCutoffAt;
        let effectiveShiftEndAt = session.effectiveShiftEndAt;

        if (!cutoff) {
          const policyVersion = session.policyVersion
            ? await AttendancePolicyVersion.findById(session.policyVersion).lean() || defaultPolicyVersion
            : defaultPolicyVersion;
          const shift = session.shift ? await AttendanceShift.findById(session.shift).lean() : null;
          const membership = await WorkspaceMembership.findOne({ workspace: workspaceId, user: session.user }).lean();
          const dayInstant = dateOnlyToInstant(session.workDateKey, timezone);
          const officeHours = await resolveEffectiveOfficeHours({
            workspaceId,
            userId: session.user,
            membership,
            date: dayInstant,
            policyVersion,
            shift
          });

          const calculated = calculateMissedCheckoutCutoff({
            checkInAt: session.checkInAt,
            workDateKey: session.workDateKey,
            timezone,
            policyVersion,
            shift,
            officeHours
          });
          cutoff = calculated.missedCheckoutCutoffAt;
          effectiveShiftEndAt = calculated.effectiveShiftEndAt;

          if (cutoff && now.getTime() < new Date(cutoff).getTime()) {
            await AttendanceSession.updateOne(
              { _id: session._id, workspaceId, status: 'ACTIVE', missedCheckoutCutoffAt: null },
              { $set: { missedCheckoutCutoffAt: cutoff, effectiveShiftEndAt: effectiveShiftEndAt || null } }
            );
          }
        }

        if (cutoff && now.getTime() >= new Date(cutoff).getTime()) {
          const result = await reconcileOverdueSession({ session, workspace: workspaceDoc });
          if (result && result.status === 'MISSED_CHECKOUT') {
            reconciledCount++;
          }
        }
      } catch (err) {
        logger.error('[AttendanceLifecycle] Sweep reconciliation error on session:', {
          sessionId: session._id,
          workspaceId,
          error: err.message
        });
      }
    }

    return { scanned: overdueCandidates.length, reconciled: reconciledCount };
  });
}

/**
 * Background worker batch sweep: finds and reconciles all expired active sessions across workspaces.
 * Strictly enforces workspace isolation by executing tenant reconciliation within workspaceContext.run().
 *
 * @param {Object} [options]
 * @param {string|ObjectId} [options.workspaceId] - Scope to a single workspace, or null for global sweep
 * @param {number} [options.batchSize] - Max sessions to process in one execution
 * @returns {Promise<{ scanned: number, reconciled: number, reconciledCount: number, workspacesProcessed: number }>}
 */
export async function reconcileAllOverdueSessions({ workspaceId = null, batchSize = null } = {}) {
  const maxBatch = batchSize || config.attendance?.batchSize || 100;
  const now = new Date();

  // 1. If a single workspaceId is specified, process it directly in its isolated context
  if (workspaceId) {
    const res = await reconcileWorkspaceOverdueSessions(workspaceId, { limit: maxBatch, now });
    return {
      scanned: res.scanned,
      reconciled: res.reconciled,
      reconciledCount: res.reconciled,
      workspacesProcessed: 1
    };
  }

  // 2. Global periodic sweep: narrowly authorized unscoped discovery of candidate workspaces
  // Strictly read-only discovery: finds distinct workspaceIds with candidate active sessions.
  // Uses indexed scan: { status: 1, missedCheckoutCutoffAt: 1, workspaceId: 1 }
  const candidateWorkspaceIds = await workspaceContext.runUnscoped(async () => {
    return await AttendanceSession.distinct('workspaceId', {
      status: 'ACTIVE',
      $or: [
        { missedCheckoutCutoffAt: { $lte: now, $ne: null } },
        { missedCheckoutCutoffAt: null }
      ]
    });
  });

  if (!candidateWorkspaceIds || !candidateWorkspaceIds.length) {
    return { scanned: 0, reconciled: 0, reconciledCount: 0, workspacesProcessed: 0 };
  }

  let totalScanned = 0;
  let totalReconciled = 0;
  let workspacesProcessed = 0;

  for (const targetWsId of candidateWorkspaceIds) {
    if (totalScanned >= maxBatch) break;

    const remainingLimit = maxBatch - totalScanned;
    try {
      const res = await reconcileWorkspaceOverdueSessions(targetWsId, { limit: remainingLimit, now });
      totalScanned += res.scanned;
      totalReconciled += res.reconciled;
      workspacesProcessed++;
    } catch (err) {
      logger.error('[AttendanceLifecycle] Error reconciling overdue sessions for workspace:', {
        workspaceId: targetWsId,
        error: err.message
      });
    }
  }

  return {
    scanned: totalScanned,
    reconciled: totalReconciled,
    reconciledCount: totalReconciled,
    workspacesProcessed
  };
}
