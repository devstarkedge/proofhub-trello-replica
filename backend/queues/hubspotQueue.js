import { Queue } from './runtime.js';
export const hubspotQueue = new Queue('flowtask.hubspot', { defaultJobOptions: { attempts: 1, removeOnComplete: true, removeOnFail: true } });
