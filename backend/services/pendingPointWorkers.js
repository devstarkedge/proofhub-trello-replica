import CardMovement from '../models/CardMovement.js';
import Report from '../modules/tracking/tracking.generatedReport.model.js';
import { processCardMovementQueue } from './cardMovementQueue.js';
import { processGeneratedReports } from '../modules/tracking/tracking.generatedReports.js';
import logger from '../utils/logger.js';
let timer;
export async function startPendingPointWorkers() {
  // Required uniqueness/lease indexes must exist even when production autoIndex
  // is disabled. Only these two new, bounded collections are initialized here.
  await CardMovement.createIndexes(); await Report.createIndexes();
  const tick=()=>{
    void processCardMovementQueue().catch(error=>logger.error('Movement recovery failed',{message:error.message}));
    void processGeneratedReports().catch(error=>logger.error('Report recovery failed',{message:error.message}));
  };
  if(!timer){tick();timer=setInterval(tick,5000);timer.unref();}
}
export function stopPendingPointWorkers(){clearInterval(timer);timer=null;}
