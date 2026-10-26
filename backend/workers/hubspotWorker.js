import { Worker } from '../queues/runtime.js';
import { hubspotQueue } from '../queues/hubspotQueue.js';
import { dispatchHubSpotWork } from '../modules/hubspot/dispatcher.js';
import { processHubSpotJob } from '../modules/hubspot/syncService.js';

let worker;
export function startHubSpotWorker() {
  if (!worker || worker.closing) worker = new Worker('flowtask.hubspot', async job => {
    if (job.name === 'dispatch') return dispatchHubSpotWork();
    if (job.name === 'sync-contact') return processHubSpotJob(job.data);
  }, { concurrency: 4 });
  return worker;
}
export const getHubSpotWorker = () => worker;
export async function recoverHubSpotWork() {
  await hubspotQueue.add('dispatch', {}, { jobId: 'hubspot-dispatch', repeat: { every: 5000 }, attempts: 1, removeOnComplete: true, removeOnFail: true });
  await dispatchHubSpotWork();
}
