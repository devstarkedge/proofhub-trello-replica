/**
 * Attendance Maintenance Scheduler
 *
 * Registers BullMQ repeatable jobs for periodic attendance maintenance:
 *   - attendance-missed-checkout-sweep: Reconciles overdue active sessions whose
 *     missed checkout cutoffs have elapsed, transitioning them to MISSED_CHECKOUT
 *     and recalculating daily attendance without inflation.
 *
 * Runs every 10 minutes via cleanupQueue when Redis is up, with an in-process
 * setInterval fallback when running without Redis.
 */
import { cleanupQueue } from '../queues/index.js';
import { reconcileAllOverdueSessions } from '../modules/attendance/attendanceSessionLifecycle.service.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const sweepIntervalMs = config.attendance?.sweepIntervalMs || (10 * 60 * 1000);
let inProcessSweeperInterval = null;

/**
 * Register BullMQ repeatable sweep on cleanupQueue.
 */
export async function registerAttendanceMaintenanceJobs() {
  await cleanupQueue.add(
    'attendance-missed-checkout-sweep',
    {},
    {
      repeat: { every: sweepIntervalMs },
      jobId: 'repeat:attendance-missed-checkout-sweep',
      removeOnComplete: true,
      removeOnFail: { count: 50 },
    }
  );

  // Run once immediately on boot
  await cleanupQueue.add('attendance-missed-checkout-sweep', {}, { jobId: 'initial-attendance-missed-checkout-sweep' });
}

/**
 * In-process fallback when Redis is unavailable.
 */
export function startInProcessAttendanceSweeper() {
  if (inProcessSweeperInterval) return;

  // Immediate non-blocking boot sweep
  reconcileAllOverdueSessions()
    .then((result) => {
      const count = result?.reconciled ?? result?.reconciledCount ?? 0;
      if (count > 0) {
        logger.info('[Attendance] Boot sweep reconciled overdue sessions', {
          scanned: result?.scanned || 0,
          reconciled: count,
          workspacesProcessed: result?.workspacesProcessed || 0
        });
      }
    })
    .catch((err) => {
      logger.error('[Attendance] Boot sweep error (non-fatal):', { error: err.message, stack: err.stack });
    });

  inProcessSweeperInterval = setInterval(() => {
    reconcileAllOverdueSessions()
      .then((result) => {
        const count = result?.reconciled ?? result?.reconciledCount ?? 0;
        if (count > 0) {
          logger.info('[Attendance] Periodic sweep reconciled overdue sessions', {
            scanned: result?.scanned || 0,
            reconciled: count,
            workspacesProcessed: result?.workspacesProcessed || 0
          });
        }
      })
      .catch((err) => {
        logger.error('[Attendance] Periodic sweep error (non-fatal):', { error: err.message, stack: err.stack });
      });
  }, sweepIntervalMs);

  inProcessSweeperInterval.unref?.();
  logger.info('[Attendance] In-process missed-checkout sweeper started', { intervalMs: sweepIntervalMs });
}

export function stopInProcessAttendanceSweeper() {
  if (inProcessSweeperInterval) {
    clearInterval(inProcessSweeperInterval);
    inProcessSweeperInterval = null;
    logger.info('[Attendance] In-process missed-checkout sweeper stopped');
  }
}
