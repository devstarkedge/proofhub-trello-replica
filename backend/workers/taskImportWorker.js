import { Worker } from '../queues/runtime.js';
import { taskImportQueue } from '../queues/index.js';
import TaskImport from '../models/TaskImport.js';
import { processImportBatch } from '../services/taskImport.js';

export { taskImportQueue };
export const enqueueImport = (jobId, workspaceId) => taskImportQueue.add('process-import', { jobId: String(jobId), workspaceId: String(workspaceId) });
let worker;
export function startTaskImportWorker() {
  if (worker && !worker.closing) return worker;
  worker = new Worker('flowtask.task-import', async ({ data }) => {
    if (await processImportBatch(data.jobId, data.workspaceId)) await enqueueImport(data.jobId, data.workspaceId);
  }, { concurrency: 1 });
  return worker;
}
export const getTaskImportWorker = () => worker;
export async function recoverTaskImports() {
  // Deliberate cross-tenant dispatcher. Payloads contain only trusted durable
  // tenant IDs; runtime restores the workspace before any domain operation.
  const jobs = await TaskImport.collection.find({ status: { $in: ['QUEUED', 'PROCESSING'] }, leaseUntil: { $lte: new Date() } }, { projection: { _id: 1, workspaceId: 1 } }).limit(50).toArray();
  for (const job of jobs) await enqueueImport(job._id, job.workspaceId);
}
