import { parentPort, workerData } from 'node:worker_threads';
import { readImportWorkbook } from '../services/taskImportWorkbook.js';
try { parentPort.postMessage({ rows: await readImportWorkbook(Buffer.from(workerData.buffer), workerData.statuses, workerData.options) }); }
catch (error) { parentPort.postMessage({ error: error.message }); }
