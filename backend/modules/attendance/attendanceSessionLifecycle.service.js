
import mongoose from 'mongoose';
import { emitChanged, finalizeAttendanceWork } from '../tracking/tracking.service.js';
import { DateTime } from 'luxon';
import AttendanceSession from './attendanceSession.model.js';
import AttendanceDay from './attendanceDay.model.js';
import { attendanceIntervals, intervalMinutes } from './attendanceIntervals.js';
import { attendanceClosureCandidate } from './attendanceActivity.service.js';
import { enqueueAttendanceEvent, processAttendanceEvents } from './attendanceEvents.service.js';
import { enqueueAttendanceReport, requestPriorityAttendanceReportDelivery } from '../../services/chat/attendanceReporting.service.js';
import AttendancePolicyVersion from './attendancePolicyVersion.model.js';
import AttendanceShift from './attendanceShift.model.js';
import Workspace from '../../models/Workspace.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import { resolveEffectiveOfficeHours } from './attendanceOfficeHoursOverride.service.js';
import { attendanceBreakWindows, recomputeAttendanceDayForDate, settleCheckoutWork } from './attendance.service.js';
import { getWorkspaceTimezone, dateOnlyToInstant } from '../leave/leaveTimezone.util.js';
import * as attendanceHooks from './attendanceHooks.js';
import * as workspaceContext from '../workspaces/workspaceContext.js';
import { getActiveWorkspaceId } from '../workspaces/workspaceContext.js';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';

/**
 * Enterprise Attendance Session Lifecycle & Cutoff Engine.
 *
 * Resolves the effective shift end and a separate fallback for sessions
 * without activity evidence.
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
 * Snapshots the effective shift end and the legacy missed-checkout deadline.
 * The legacy deadline applies only when activity evidence is unavailable.
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

// Older active rows may predate the stored cutoff.
async function restoreLegacyDeadline(session, workspace) {
  if (session.missedCheckoutCutoffAt || session.lastActivityAt) return session;
  const { workspaceId, user, workDateKey } = session;
  const timezone = getWorkspaceTimezone(workspace);
  const policyVersion = (session.policyVersion && await AttendancePolicyVersion.findById(session.policyVersion).lean())
    || await AttendancePolicyVersion.findOne({ workspaceId, status: { $in: ['active', 'published'] } }).lean() || {};
  const shift = session.shift ? await AttendanceShift.findById(session.shift).lean() : null;
  const membership = await WorkspaceMembership.findOne({ workspace: workspaceId, user }).lean();
  const officeHours = await resolveEffectiveOfficeHours({
    workspaceId, userId: user, membership, date: dateOnlyToInstant(workDateKey, timezone), policyVersion, shift
  });
  const deadlines = calculateMissedCheckoutCutoff({ ...session, timezone, policyVersion, shift, officeHours });
  return AttendanceSession.findOneAndUpdate({
    _id: session._id, workspaceId, status: 'ACTIVE', missedCheckoutCutoffAt: null, lastActivityAt: null
  }, { $set: { ...deadlines, autoCheckoutDueAt: deadlines.effectiveShiftEndAt } }, { new: true }).lean();
}

export async function reconcileOverdueSession({ session, workspace = null, now = new Date() }) {
  if (!session || session.status !== 'ACTIVE') return null;
  const { workspaceId, user } = session;
  const execute = async () => {
    const workspaceDoc = workspace || await Workspace.findById(workspaceId).select('attendanceModuleEnabled timezone').lean();
    const candidate = await restoreLegacyDeadline(session, workspaceDoc);
    if (!candidate || !attendanceClosureCandidate(candidate, now)) return null;

    const dbSession = await mongoose.startSession();
    let result;
    try {
      await dbSession.withTransaction(async () => {
        result = null;
        const current = await AttendanceSession.findOne({
          _id: session._id, workspaceId, user, status: 'ACTIVE'
        }).session(dbSession).lean();
        if (!current) return;
        const closure = attendanceClosureCandidate(current, now);
        if (!closure) return;

        const auto = closure.reason === 'POST_SHIFT_INACTIVITY';
        const processedAt = new Date();
        const updated = await AttendanceSession.findOneAndUpdate({
          _id: current._id, workspaceId, user, status: 'ACTIVE', lastActivityAt: current.lastActivityAt || null
        }, { $set: {
          status: auto ? 'AUTO_CHECKOUT' : 'MISSED_CHECKOUT',
          closureReason: closure.reason,
          systemGeneratedCheckout: true,
          reconciledAt: processedAt,
          ...(auto ? { checkOutAt: closure.at, autoCheckoutProcessedAt: processedAt }
            : { checkOutAt: null, missedCheckoutDetectedAt: processedAt, missedCheckoutCutoffAt: closure.at })
        } }, { session: dbSession, new: true, runValidators: true });
        if (!updated) return;

        const timezone = getWorkspaceTimezone(workspaceDoc);
        const membership = await WorkspaceMembership.findOne({ workspace: workspaceId, user }).session(dbSession).lean();
        let day = null;
        if (membership) {
          await AttendanceDay.updateOne({ _id: current.attendanceDay, workspaceId, user },
            { $inc: { evaluationRevision: 1 } }, { session: dbSession });
          try {
            ({ day } = await recomputeAttendanceDayForDate({
              workspaceId, userId: user, membership, workspace: workspaceDoc, workDateKey: current.workDateKey, dbSession
            }));
          } catch (error) {
            if (auto || error.code !== 'POLICY_NOT_CONFIGURED') throw error;
            logger.warn('[AttendanceLifecycle] No policy for legacy attendance recomputation', { workspaceId, sessionId: current._id });
          }
        }

        const key = auto ? `checkout-${updated._id}` : null;
        let work;
        if (auto) {
          updated.checkoutSummary = {
            attendanceSeconds: intervalMinutes(attendanceIntervals([updated], closure.at,
              await attendanceBreakWindows(workspaceId, [updated], closure.at, dbSession))) * 60,
            outcome: { presenceState: day?.presenceState, leaveState: day?.leaveState }
          };
          const settlement = await settleCheckoutWork(updated, timezone, dbSession, { allowUnmarked: true });
          updated.checkoutSummary = settlement.summary;
          await enqueueAttendanceReport({ action: 'checkout', attendance: updated, at: closure.at, day, dbSession });
          await enqueueAttendanceEvent({
            workspaceId, user, key, kind: 'CHECKED_OUT', attendanceSession: updated._id, workDateKey: current.workDateKey
          }, dbSession);
        } else {
          work = await finalizeAttendanceWork(updated, dbSession);
        }
        result = { updated, day, key, work };
      });
    } finally {
      await dbSession.endSession();
    }
    if (!result) return null;

    if (result.key) {
      requestPriorityAttendanceReportDelivery(workspaceId, result.updated._id);
      void processAttendanceEvents(workspaceId, { key: result.key }).catch(error => {
        logger.warn('[AttendanceLifecycle] Checkout event will retry', { error: error.message });
      });
    } else {
      try {
        if (result.work) await emitChanged(result.work);
        attendanceHooks.onMissedCheckoutDetected(result.updated, result.day);
      } catch (error) {
        logger.warn('[AttendanceLifecycle] Missed checkout notification failed', { error: error.message });
      }
    }
    return result.updated;
  };
  return String(getActiveWorkspaceId()) === String(workspaceId) ? execute() : workspaceContext.run({ workspaceId }, execute);
}

function overdueFilter(now) {
  return {
    status: 'ACTIVE',
    $or: [
      { lastActivityAt: { $type: 'date' }, autoCheckoutDueAt: { $type: 'date', $lte: now }, effectiveShiftEndAt: { $lte: now } },
      { lastActivityAt: null, missedCheckoutCutoffAt: { $type: 'date', $lte: now }, effectiveShiftEndAt: { $not: { $gt: now } } },
      { lastActivityAt: null, missedCheckoutCutoffAt: null }
    ]
  };
}

export async function reconcileOverdueSessionsForUser({ workspaceId, userId, workspace = null }) {
  const execute = async () => {
    const now = new Date();
    const session = await AttendanceSession.findOne({ workspaceId, user: userId, ...overdueFilter(now) }).lean();
    const updated = session && await reconcileOverdueSession({ session, workspace, now });
    return updated ? [updated] : [];
  };
  return String(getActiveWorkspaceId()) === String(workspaceId) ? execute() : workspaceContext.run({ workspaceId }, execute);
}

export async function reconcileWorkspaceOverdueSessions(workspaceId, { limit = 100, now = new Date() } = {}) {
  return workspaceContext.run({ workspaceId }, async () => {
    const candidates = await AttendanceSession.find({ workspaceId, ...overdueFilter(now) })
      .sort({ checkInAt: 1 }).limit(limit).lean();
    if (!candidates.length) return { scanned: 0, reconciled: 0 };
    const workspace = await Workspace.findById(workspaceId).select('attendanceModuleEnabled timezone').lean();
    let reconciled = 0;
    for (const session of candidates) {
      try {
        if (await reconcileOverdueSession({ session, workspace, now })) reconciled++;
      } catch (error) {
        logger.error('[AttendanceLifecycle] Sweep reconciliation failed', {
          error: error.message, workspaceId, sessionId: session._id
        });
      }
    }
    return { scanned: candidates.length, reconciled };
  });
}

export async function reconcileAllOverdueSessions({ workspaceId = null, batchSize = null } = {}) {
  const limit = batchSize || config.attendance?.batchSize || 100;
  const now = new Date();
  const workspaceIds = workspaceId ? [workspaceId] : await workspaceContext.runUnscoped(
    () => AttendanceSession.distinct('workspaceId', overdueFilter(now)).exec()
  );
  let scanned = 0, reconciled = 0, workspacesProcessed = 0;
  for (const id of workspaceIds) {
    if (scanned >= limit) break;
    try {
      const result = await reconcileWorkspaceOverdueSessions(id, { limit: limit - scanned, now });
      scanned += result.scanned;
      reconciled += result.reconciled;
      workspacesProcessed++;
    } catch (error) {
      logger.error('[AttendanceLifecycle] Workspace sweep failed', { error: error.message, workspaceId: id });
    }
  }
  return { scanned, reconciled, reconciledCount: reconciled, workspacesProcessed };
}
