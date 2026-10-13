/**
 * Remediate Suspicious / Inflated Attendance Sessions
 *
 * Scans for historical attendance sessions affected by the late-checkout bug:
 *   - Stale ACTIVE sessions from past work dates whose cutoff has expired
 *   - COMPLETED / CLOSED sessions with elapsed duration > 16 hours spanning multiple calendar days
 *   - AttendanceDays with workedMinutes > 16 hours (960 min)
 *
 * Usage:
 *   node backend/scripts/remediateSuspiciousAttendance.js [--dry-run] [--apply] [--workspace=<id>] [--max-hours=16]
 *
 * Default is --dry-run. Pass --apply to perform remediation writes.
 */
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import config from '../config/index.js';
import Workspace from '../models/Workspace.js';
import AttendanceSession from '../modules/attendance/attendanceSession.model.js';
import AttendanceDay from '../modules/attendance/attendanceDay.model.js';
import { reconcileOverdueSession } from '../modules/attendance/attendanceSessionLifecycle.service.js';
import { recomputeAttendanceDayForDate } from '../modules/attendance/attendance.service.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';

export async function scanAndRemediate({
  workspaceId = null,
  apply = false,
  maxSessionHours = 16
} = {}) {
  const isDryRun = !apply;
  console.log(`\n======================================================`);
  console.log(`ATTENDANCE REMEDIATION SCAN (${isDryRun ? 'DRY RUN' : 'APPLY MODE'})`);
  console.log(`Max session duration threshold: ${maxSessionHours} hours`);
  if (workspaceId) console.log(`Scoping to workspace: ${workspaceId}`);
  console.log(`======================================================\n`);

  const workspaceFilter = workspaceId ? { _id: workspaceId } : {};
  const workspaces = await Workspace.find(workspaceFilter).select('_id name timezone attendanceModuleEnabled').lean();

  const report = {
    workspacesScanned: workspaces.length,
    staleActiveSessionsFound: 0,
    staleActiveSessionsRemediated: 0,
    inflatedCompletedSessionsFound: 0,
    inflatedCompletedSessionsRemediated: 0,
    affectedDaysFound: 0,
    affectedDaysRecomputed: 0,
    details: []
  };

  const maxDurationMs = maxSessionHours * 60 * 60 * 1000;

  for (const ws of workspaces) {
    await workspaceContext.run({ workspaceId: ws._id }, async () => {
      // 1. Find stale active sessions
      const staleActiveSessions = await AttendanceSession.find({
        workspaceId: ws._id,
        status: 'ACTIVE'
      }).lean();

      for (const session of staleActiveSessions) {
        report.staleActiveSessionsFound++;
        const recordDetail = {
          workspace: ws.name,
          workspaceId: ws._id,
          userId: session.user,
          sessionId: session._id,
          workDateKey: session.workDateKey,
          issue: 'STALE_ACTIVE_SESSION',
          checkInAt: session.checkInAt,
          action: isDryRun ? 'WOULD_RECONCILE_AS_MISSED_CHECKOUT' : 'RECONCILED_AS_MISSED_CHECKOUT'
        };
        report.details.push(recordDetail);

        if (apply) {
          try {
            await reconcileOverdueSession({
              session,
              workspace: ws,
              reason: 'REMEDIATION_SCRIPT'
            });
            report.staleActiveSessionsRemediated++;
          } catch (err) {
            console.error(`Failed to reconcile session ${session._id}:`, err.message);
          }
        }
      }

      // 2. Find historical completed sessions with inflated duration
      const allCompletedSessions = await AttendanceSession.find({
        workspaceId: ws._id,
        status: { $in: ['CLOSED', 'COMPLETED'] },
        checkInAt: { $ne: null },
        checkOutAt: { $ne: null }
      }).lean();

      for (const session of allCompletedSessions) {
        const start = new Date(session.checkInAt).getTime();
        const end = new Date(session.checkOutAt).getTime();
        const durationMs = end - start;
        const durationHours = durationMs / (1000 * 60 * 60);

        if (durationMs > maxDurationMs) {
          report.inflatedCompletedSessionsFound++;
          const recordDetail = {
            workspace: ws.name,
            workspaceId: ws._id,
            userId: session.user,
            sessionId: session._id,
            workDateKey: session.workDateKey,
            issue: 'INFLATED_DURATION',
            durationHours: durationHours.toFixed(2),
            checkInAt: session.checkInAt,
            checkOutAt: session.checkOutAt,
            action: isDryRun ? 'WOULD_FLAG_AND_RECOMPUTE' : 'FLAGGED_AND_RECOMPUTED'
          };
          report.details.push(recordDetail);

          if (apply) {
            try {
              // Transition session to MISSED_CHECKOUT with audit trail
              await AttendanceSession.updateOne(
                { _id: session._id },
                {
                  $set: {
                    status: 'MISSED_CHECKOUT',
                    closureReason: 'REMEDIATED_SUSPICIOUS',
                    reconciledAt: new Date(),
                    missedCheckoutDetectedAt: new Date(),
                    provisionalMinutes: Math.round(durationMs / 60000)
                  }
                }
              );
              report.inflatedCompletedSessionsRemediated++;

              // Recompute day
              await recomputeAttendanceDayForDate({
                workspaceId: ws._id,
                userId: session.user,
                membership: null,
                workspace: ws,
                workDateKey: session.workDateKey
              });
              report.affectedDaysRecomputed++;
            } catch (err) {
              console.error(`Failed to remediate inflated session ${session._id}:`, err.message);
            }
          }
        }
      }

      // 3. Find AttendanceDays with workedMinutes > 16 hours
      const inflatedDays = await AttendanceDay.find({
        workspaceId: ws._id,
        workedMinutes: { $gt: maxSessionHours * 60 }
      }).lean();

      for (const day of inflatedDays) {
        report.affectedDaysFound++;
        if (apply && !report.details.some(d => d.workDateKey === day.workDateKey && String(d.userId) === String(day.user))) {
          try {
            await recomputeAttendanceDayForDate({
              workspaceId: ws._id,
              userId: day.user,
              membership: null,
              workspace: ws,
              workDateKey: day.workDateKey
            });
            report.affectedDaysRecomputed++;
          } catch (err) {
            console.error(`Failed to recompute day ${day._id}:`, err.message);
          }
        }
      }
    });
  }

  console.log(`\n======================================================`);
  console.log(`SCAN SUMMARY:`);
  console.log(`Workspaces scanned:                    ${report.workspacesScanned}`);
  console.log(`Stale active sessions found:           ${report.staleActiveSessionsFound}`);
  if (apply) {
    console.log(`Stale active sessions remediated:      ${report.staleActiveSessionsRemediated}`);
  }
  console.log(`Inflated completed sessions found:     ${report.inflatedCompletedSessionsFound}`);
  if (apply) {
    console.log(`Inflated sessions remediated:          ${report.inflatedCompletedSessionsRemediated}`);
    console.log(`Attendance days recomputed:            ${report.affectedDaysRecomputed}`);
  }
  console.log(`Total suspicious records detected:     ${report.details.length}`);
  console.log(`======================================================\n`);

  if (report.details.length > 0) {
    console.log('Sample affected records (up to 10):');
    console.table(report.details.slice(0, 10));
  } else {
    console.log('No suspicious inflated or stale attendance sessions detected.');
  }

  return report;
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const wsArg = args.find((a) => a.startsWith('--workspace='));
  const workspaceId = wsArg ? wsArg.split('=')[1] : null;
  const maxHoursArg = args.find((a) => a.startsWith('--max-hours='));
  const maxSessionHours = maxHoursArg ? parseFloat(maxHoursArg.split('=')[1]) : 16;

  mongoose
    .connect(config.db.uri, {
      maxPoolSize: config.db.maxPoolSize,
      serverSelectionTimeoutMS: config.db.serverSelectionTimeoutMS,
    })
    .then(async () => {
      try {
        await scanAndRemediate({ workspaceId, apply, maxSessionHours });
      } finally {
        await mongoose.disconnect();
      }
    })
    .catch((err) => {
      console.error('Database connection failed:', err.message);
      process.exit(1);
    });
}
