import { parentPort, workerData } from 'node:worker_threads';
import { attendanceTeamWorkbook } from './attendanceTeamWorkbook.js';

try {
  const bytes = new Uint8Array(await attendanceTeamWorkbook(workerData));
  parentPort.postMessage({bytes}, [bytes.buffer]);
} catch (error) {
  parentPort.postMessage({error:error.message, statusCode:error.statusCode || 503});
}
