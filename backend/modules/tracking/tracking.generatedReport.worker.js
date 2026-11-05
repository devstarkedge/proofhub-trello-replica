import { parentPort, workerData } from 'node:worker_threads';
import { trackingWorkbook } from './tracking.generatedReport.workbook.js';

// CPU-heavy cell formatting/ZIP work never runs on the HTTP event loop.
try {
  const workbook = await trackingWorkbook(workerData.report, workerData.data);
  if (workbook.length > 3 * 1024 * 1024) throw Object.assign(new Error('Report exceeds the 3 MB storage limit. Select an employee or project.'), { statusCode: 413 });
  const bytes = new Uint8Array(workbook);
  parentPort.postMessage({ bytes }, [bytes.buffer]);
} catch (error) {
  parentPort.postMessage({ error: error.message, statusCode: error.statusCode || 503 });
}
