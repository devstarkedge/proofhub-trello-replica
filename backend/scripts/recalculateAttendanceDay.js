import mongoose from 'mongoose';
import config from '../config/index.js';
import Workspace from '../models/Workspace.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import AuditLog from '../models/AuditLog.js';
import AttendanceDay from '../modules/attendance/attendanceDay.model.js';
import { run } from '../modules/workspaces/workspaceContext.js';
import { getWorkspaceTimezone, instantToDateOnlyKey } from '../modules/leave/leaveTimezone.util.js';
import { computeAndUpsertDay, readAttendanceDayEvaluation } from '../modules/attendance/attendance.service.js';
import { resolveAttendanceStatus } from '../modules/attendance/attendanceStatusResolver.service.js';
import { validateDateRange } from '../utils/calendarDateRange.js';

const [workspaceId, userId, workDateKey, mode, ...extra] = process.argv.slice(2);
const apply = mode === '--apply';
const snapshot = day => ({
  presenceState: day.presenceState, punctualityState: day.punctualityState,
  leaveState: day.leaveState, presenceFraction: day.presenceFraction,
  leaveFraction: day.leaveFraction, workedMinutes: day.workedMinutes,
  officeSeconds: day.officeSeconds ?? null
});

async function recalculate(dbSession = null) {
  const workspace = await Workspace.findById(workspaceId).select('timezone attendanceModuleEnabled').session(dbSession).lean();
  const membership = await WorkspaceMembership.findOne({ workspace: workspaceId, user: userId }).session(dbSession).lean();
  if (!workspace || !membership) throw new Error('Workspace or member was not found');
  if (workDateKey >= instantToDateOnlyKey(new Date(), getWorkspaceTimezone(workspace))) {
    throw new Error('Choose a completed business date before today');
  }
  const day = await AttendanceDay.findOne({ workspaceId, user: userId, workDateKey }).session(dbSession).lean();
  if (!day?.policyVersion) return { skipped: 'No recorded day with a pinned policy version' };
  const evaluation = await readAttendanceDayEvaluation({ workspaceId, userId, membership, workspace, workDateKey, dbSession, historicalRepair: true });
  if (!evaluation) return { skipped: 'The day has a manual regularization, open evidence, or no reliable historical office settings' };

  const status = resolveAttendanceStatus(evaluation);
  if (status.exceptionFlags.includes('LEAVE_COVERAGE_UNRESOLVED')) return { skipped: 'Approved leave coverage needs review' };
  const before = snapshot(day), after = snapshot(status);
  const changed = JSON.stringify(before) !== JSON.stringify(after);
  if (apply && changed) {
    await computeAndUpsertDay(evaluation);
    await AuditLog.create([{
      workspace: workspaceId, action: 'ATTENDANCE_DAY_RECALCULATED', category: 'attendance_management',
      targetType: 'AttendanceDay', targetId: day._id, summary: 'Recalculated attendance using the recorded policy version',
      changes: { before: { ...before, workDateKey, policyVersion: day.policyVersion }, after: { ...after, workDateKey, policyVersion: day.policyVersion } }
    }], { session: dbSession });
  }
  return { workDateKey, policyVersion: day.policyVersion, graceMinutes: evaluation.officeHours.graceMinutes,
    earlyExitGraceMinutes: evaluation.officeHours.earlyExitGraceMinutes,
    minimumFullDayMinutes: evaluation.officeHours.minimumFullDayMinutes, before, after, changed, applied: apply && changed };
}

try {
  if (extra.length || (mode && !apply) || !mongoose.isValidObjectId(workspaceId) || !mongoose.isValidObjectId(userId)) {
    throw new Error('Usage: node scripts/recalculateAttendanceDay.js <workspaceId> <userId> <YYYY-MM-DD> [--apply]');
  }
  validateDateRange(workDateKey, workDateKey);
  await mongoose.connect(config.db.uri, { autoIndex: false, autoCreate: false });
  const result = await run({ workspaceId }, async () => {
    const session = await mongoose.startSession();
    try {
      if (!apply) return await recalculate(session);
      let result;
      await session.withTransaction(async () => { result = await recalculate(session); });
      return result;
    } finally {
      await session.endSession();
    }
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.name === 'MongoServerSelectionError' ? 'Could not connect to the configured database' : error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
