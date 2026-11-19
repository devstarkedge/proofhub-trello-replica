import { Worker } from 'node:worker_threads';

// Match the existing tracking-report worker boundary: formatting and ZIP work
// run outside the API thread, with a bounded heap, timeout and cancellation.
export function buildAttendanceTeamWorkbook(data, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Export canceled', 'AbortError')); return; }
    const worker = new Worker(new URL('./attendanceTeamWorkbook.worker.js', import.meta.url), {
      workerData:data, resourceLimits:{maxOldGenerationSizeMb:256}
    });
    let settled = false;
    const finish = (error, bytes) => {
      if (settled) return;
      settled = true; clearTimeout(timeout); signal?.removeEventListener('abort', abort);
      if (error) { reject(error); void worker.terminate(); } else resolve(Buffer.from(bytes));
    };
    const abort = () => finish(new DOMException('Export canceled', 'AbortError'));
    const timeout = setTimeout(() => finish(Object.assign(new Error('Report formatting took too long. Select a smaller reporting period.'), {statusCode:503})), 60000);
    timeout.unref();
    signal?.addEventListener('abort', abort, {once:true});
    worker.once('message', result => finish(result.error ? Object.assign(new Error(result.error), {statusCode:result.statusCode}) : null, result.bytes));
    worker.once('error', error => finish(error));
    worker.once('exit', () => { if (!settled) finish(new Error('Report formatting was interrupted')); });
    if (signal?.aborted) abort();
  });
}
