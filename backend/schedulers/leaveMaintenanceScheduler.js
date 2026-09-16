/**
 * Leave Maintenance Scheduler
 *
 * Registers BullMQ repeatable jobs for monthly accrual and bucket expiry —
 * mirrors maintenanceScheduler.js's shape exactly (repeat + an immediate
 * boot-time run). Both underlying operations are idempotent by
 * construction (see leaveAccrual.service.js / leaveExpiry.service.js), so
 * re-registering on every boot and firing an immediate run alongside the
 * repeat schedule is always safe, never a double-credit/double-expire.
 *
 * BullMQ-based jobs do not run at all while Redis is unavailable (no
 * setImmediate fallback, unlike email/notifications) — registerLeaveMaintenanceJobs
 * is only called from queueManager.initQueues() when Redis is confirmed up.
 * runLeaveAccrualCatchUp() is the independent, non-blocking safety net for
 * the "Redis was down" gap; see server.js.
 */
import { leaveQueue } from '../queues/index.js';
import { runMonthlyAccrualForAllWorkspaces } from '../modules/leave/leaveAccrual.service.js';
import { runExpirySweepForAllWorkspaces } from '../modules/leave/leaveExpiry.service.js';
import { runScheduledDefaultPolicyActivations } from '../modules/leave/leavePolicy.service.js';
import logger from '../utils/logger.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const SIX_HOURS = 6 * 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

export async function registerLeaveMaintenanceJobs() {
  await leaveQueue.add(
    'leave-monthly-accrual',
    {},
    { repeat: { every: ONE_DAY }, jobId: 'repeat:leave-monthly-accrual', removeOnComplete: true, removeOnFail: { count: 50 } }
  );
  await leaveQueue.add(
    'leave-expiry-sweep',
    {},
    { repeat: { every: SIX_HOURS }, jobId: 'repeat:leave-expiry-sweep', removeOnComplete: true, removeOnFail: { count: 50 } }
  );
  // Runs far more often than accrual/expiry — a policy scheduled to start
  // "on Oct 1" should take effect close to that workspace-tz midnight
  // boundary, not up to a day late.
  await leaveQueue.add(
    'leave-policy-activation-sweep',
    {},
    { repeat: { every: FIFTEEN_MINUTES }, jobId: 'repeat:leave-policy-activation-sweep', removeOnComplete: true, removeOnFail: { count: 50 } }
  );
  // Also run once immediately on boot rather than waiting for the first
  // interval — matches maintenanceScheduler.js's own "initial-*" jobs.
  await leaveQueue.add('leave-monthly-accrual', {}, { jobId: 'initial-leave-monthly-accrual' });
  await leaveQueue.add('leave-expiry-sweep', {}, { jobId: 'initial-leave-expiry-sweep' });
  await leaveQueue.add('leave-policy-activation-sweep', {}, { jobId: 'initial-leave-policy-activation-sweep' });
}

/**
 * Non-blocking, independent-of-BullMQ catch-up for the case Redis was down
 * (or the worker crashed) across an entire accrual cycle — a boot-time
 * safety net, not the primary mechanism. Fire-and-forget: never delays the
 * HTTP server from accepting traffic, and any failure is logged, never
 * thrown, since a delayed accrual run tomorrow is recoverable but a server
 * that fails to boot is not.
 */
export function runLeaveAccrualCatchUp() {
  runMonthlyAccrualForAllWorkspaces()
    .then((results) => {
      const totalCreated = results.reduce((sum, r) => sum + (r.created || 0), 0);
      if (totalCreated > 0) logger.info('[Leave] boot-time accrual catch-up created buckets', { totalCreated, workspaces: results.length });
    })
    .catch((error) => logger.error('[Leave] boot-time accrual catch-up failed (non-fatal)', { error: error.message }));

  runExpirySweepForAllWorkspaces()
    .catch((error) => logger.error('[Leave] boot-time expiry catch-up failed (non-fatal)', { error: error.message }));

  runScheduledDefaultPolicyActivations()
    .then((results) => {
      const activated = results.filter((r) => r.activated).length;
      if (activated > 0) logger.info('[Leave] boot-time policy-activation catch-up activated policies', { activated });
    })
    .catch((error) => logger.error('[Leave] boot-time policy-activation catch-up failed (non-fatal)', { error: error.message }));
}
