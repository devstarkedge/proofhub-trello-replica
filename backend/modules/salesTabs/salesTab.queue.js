/**
 * SalesTab Queue
 *
 * Defines the sales-alert BullMQ queue and enqueue helpers.
 */
import { Queue } from 'bullmq';
import { getSharedConnection } from '../../queues/connection.js';
import config from '../../config/index.js';

const defaultJobOptions = {
  attempts: config.queues?.defaultAttempts || 3,
  backoff: config.queues?.defaultBackoff || { type: 'exponential', delay: 1000 },
  removeOnComplete: { count: 100, age: 24 * 3600 },
  removeOnFail: { count: 50, age: 24 * 3600 },
};

export const salesAlertQueue = new Queue('flowtask.sales-alert', {
  connection: getSharedConnection(),
  defaultJobOptions,
});

// ─── Enqueue Helpers ────────────────────────────────────────────────────────

export function enqueueSalesAlertNewRow(row, opts = {}) {
  return salesAlertQueue.add('evaluate-new-row', { row }, opts);
}

export function enqueueSalesAlertRowUpdate(oldRow, newRow, opts = {}) {
  return salesAlertQueue.add('evaluate-row-update', { oldRow, newRow }, opts);
}

export function enqueueSalesAlertOverdueCheck(opts = {}) {
  return salesAlertQueue.add('check-overdue-alerts', {}, opts);
}
