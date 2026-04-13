/**
 * Sales Alert Worker
 *
 * BullMQ worker that processes sales tab alert jobs:
 *   - evaluate-new-row     — check newly created row against watch tabs
 *   - evaluate-row-update  — check updated row against watch tabs
 *   - check-overdue-alerts — periodic scan for overdue/no-response rules
 */
import { Worker } from 'bullmq';
import { getWorkerConnection } from '../queues/connection.js';
import {
  evaluateNewRow,
  evaluateRowUpdate,
  evaluateOverdueAlerts,
} from '../modules/salesTabs/salesTab.alert.service.js';

const LOG = '[Worker:SalesAlert]';

let _worker = null;

export function startSalesAlertWorker() {
  if (_worker) return _worker;

  _worker = new Worker(
    'flowtask.sales-alert',
    async (job) => {
      switch (job.name) {
        case 'evaluate-new-row': {
          const { row } = job.data;
          await evaluateNewRow(row);
          break;
        }

        case 'evaluate-row-update': {
          const { oldRow, newRow } = job.data;
          await evaluateRowUpdate(oldRow, newRow);
          break;
        }

        case 'check-overdue-alerts': {
          await evaluateOverdueAlerts();
          break;
        }

        default:
          console.warn(`${LOG} Unknown job name: ${job.name}`);
      }
    },
    {
      connection: getWorkerConnection(),
      concurrency: 1,
    }
  );

  _worker.on('completed', (job) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`${LOG} Completed ${job.name} [${job.id}]`);
    }
  });

  _worker.on('failed', (job, err) => {
    console.error(`${LOG} Failed ${job?.name} [${job?.id}]:`, err.message);
  });

  console.log(`${LOG} Started (concurrency: 1)`);
  return _worker;
}

export function getSalesAlertWorker() {
  return _worker;
}
