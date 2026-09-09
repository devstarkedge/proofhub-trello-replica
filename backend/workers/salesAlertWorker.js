/**
 * Sales Alert Worker
 *
 * BullMQ worker that processes sales tab alert jobs:
 *   - evaluate-new-row         — detect new-row transitions, deliver instant ones synchronously
 *   - evaluate-row-update      — detect update-driven transitions, deliver instant ones synchronously
 *   - check-overdue-alerts     — periodic detection scan for overdue/no-response rules
 *   - deliver-pending-sales-alerts — periodic delivery sweep (15min/hourly/daily digests + retry safety-net)
 *   - reconcile-watch-baseline — seed/refresh SalesTabWatchState so a tab whose watch just
 *                                turned on (or whose filters just changed) doesn't flood
 */
import { Worker } from 'bullmq';
import { getWorkerConnection } from '../queues/connection.js';
import {
  evaluateNewRow,
  evaluateRowUpdate,
  evaluateOverdueAlerts,
} from '../modules/salesTabs/salesTab.alert.service.js';
import { deliverAlertEvents, deliverPendingAlertsSweep } from '../modules/salesTabs/salesTab.watchDelivery.service.js';
import { reconcileWatchBaseline } from '../modules/salesTabs/salesTab.watchState.service.js';
import SalesTab from '../modules/salesTabs/salesTab.model.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';

const LOG = '[Worker:SalesAlert]';

/** Deliver whichever just-detected events are already due (i.e. instant-frequency tabs). */
async function deliverIfDue(events) {
  if (!events || events.length === 0) return;
  const due = events.filter((e) => new Date(e.scheduledFor) <= new Date());
  if (due.length > 0) {
    await deliverAlertEvents(due);
  }
}

let _worker = null;

export function startSalesAlertWorker() {
  if (_worker) return _worker;

  _worker = new Worker(
    'flowtask.sales-alert',
    async (job) => {
      // This worker runs outside any Express request — jobs for a specific
      // row carry that row's own workspaceId (SalesRow is workspace-owned);
      // the periodic scans are deliberate cross-tenant sweeps.
      switch (job.name) {
        case 'evaluate-new-row': {
          const { row } = job.data;
          await workspaceContext.run({ workspaceId: row.workspaceId }, async () => {
            const events = await evaluateNewRow(row);
            await deliverIfDue(events);
          });
          break;
        }

        case 'evaluate-row-update': {
          const { oldRow, newRow } = job.data;
          await workspaceContext.run({ workspaceId: newRow?.workspaceId || oldRow?.workspaceId }, async () => {
            const events = await evaluateRowUpdate(oldRow, newRow);
            await deliverIfDue(events);
          });
          break;
        }

        case 'check-overdue-alerts': {
          // evaluateOverdueAlerts() internally re-scopes per-tab (see its
          // own header comment) — the outer call stays unscoped since it
          // needs to see every workspace's due tabs in one job.
          await workspaceContext.runUnscoped(() => evaluateOverdueAlerts());
          break;
        }

        case 'deliver-pending-sales-alerts': {
          await workspaceContext.runUnscoped(() => deliverPendingAlertsSweep());
          break;
        }

        case 'reconcile-watch-baseline': {
          const { tabId } = job.data;
          const tab = await workspaceContext.runUnscoped(() => SalesTab.findById(tabId).lean());
          if (!tab) break;
          await workspaceContext.run({ workspaceId: tab.workspaceId }, () => reconcileWatchBaseline(tab));
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
