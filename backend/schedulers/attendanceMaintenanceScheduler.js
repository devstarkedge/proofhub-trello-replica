/**
 * Attendance Maintenance Scheduler
 *
 * Registers repeatable jobs for periodic attendance maintenance:
 *   - attendance-missed-checkout-sweep: Reconciles overdue active sessions whose
 *     activity deadline or missing-telemetry fallback is due
 *     and recalculating daily attendance without inflation.
 *
 * Uses the local job runtime outside production and durable jobs in production.
 */
import { cleanupQueue } from '../queues/index.js';
import config from '../config/index.js';

const sweepIntervalMs = config.attendance?.sweepIntervalMs || (60 * 1000);

/**
 * Register recurring sweeps on cleanupQueue.
 */
export async function registerAttendanceMaintenanceJobs() {
  await cleanupQueue.add('attendance-event-delivery',{}, {repeat:{every:15000},jobId:'repeat:attendance-event-delivery',removeOnComplete:true,removeOnFail:{count:50}});
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
  const schedules = await cleanupQueue.getRepeatableJobs();
  for (const schedule of schedules) {
    if (schedule.name === 'attendance-missed-checkout-sweep' && Number(schedule.every) !== sweepIntervalMs) {
      await cleanupQueue.removeRepeatableByKey(schedule.key);
    }
  }

  // Run once immediately on boot
  await cleanupQueue.add('attendance-missed-checkout-sweep', {}, { jobId: 'initial-attendance-missed-checkout-sweep', removeOnComplete: true });
}
