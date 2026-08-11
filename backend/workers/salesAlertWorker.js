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
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';

const LOG = '[Worker:SalesAlert]';

let _worker = null;

export function startSalesAlertWorker() {
  if (_worker) return _worker;

  _worker = new Worker(
    'flowtask.sales-alert',
    async (job) => {
      // This worker runs outside any Express request — jobs for a specific
      // row carry that row's own workspaceId (SalesRow is workspace-owned);
      // the periodic overdue scan is a deliberate cross-tenant sweep.
      switch (job.name) {
        case 'evaluate-new-row': {
          const { row } = job.data;
          await workspaceContext.run({ workspaceId: row.workspaceId }, () => evaluateNewRow(row));
          break;
        }

        case 'evaluate-row-update': {
          const { oldRow, newRow } = job.data;
          await workspaceContext.run({ workspaceId: newRow?.workspaceId || oldRow?.workspaceId }, () => (
            evaluateRowUpdate(oldRow, newRow)
          ));
          break;
        }

        case 'check-overdue-alerts': {
          await workspaceContext.runUnscoped(() => evaluateOverdueAlerts());
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
