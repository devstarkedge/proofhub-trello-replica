import { Worker } from 'node:worker_threads';

export function buildTrackingWorkbook(report, data) {
  return new Promise((resolve, reject) => {
    let received = false;
    const worker = new Worker(new URL('./tracking.generatedReport.worker.js', import.meta.url), {
      workerData: { report: { name: report.name, filters: report.filters, createdAt: report.createdAt, generatedBy: report.generatedBy }, data },
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    });
    const timeout = setTimeout(() => {
      reject(Object.assign(new Error('Report formatting took too long. Select a smaller reporting scope.'), { statusCode: 503 }));
      void worker.terminate();
    }, 60000);
    timeout.unref();
    worker.once('message', result => {
      received = true;
      clearTimeout(timeout);
      if (result.error) reject(Object.assign(new Error(result.error), { statusCode: result.statusCode }));
      else resolve(Buffer.from(result.bytes));
    });
    worker.once('error', error => { clearTimeout(timeout); reject(error); });
    worker.once('exit', code => {
      clearTimeout(timeout);
      if (code !== 0 || !received) reject(new Error('Report formatting was interrupted'));
    });
  });
}
