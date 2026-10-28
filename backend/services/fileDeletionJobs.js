import { randomUUID } from 'node:crypto';
import FileDeletionJob from '../models/FileDeletionJob.js';
import Attachment from '../models/Attachment.js';
import { run, runUnscoped } from '../modules/workspaces/workspaceContext.js';
import { deleteFromCloudinary } from '../utils/cloudinary.js';

let processing;
export function processFileDeletionJobs(options = {}) {
  if (!processing) processing = processBatch(options).finally(() => { processing = null; });
  return processing;
}
async function processBatch({ limit = 50 } = {}) {
  const now = new Date();
  const candidates = await runUnscoped(async () => await FileDeletionJob.find({
    nextAttemptAt: { $lte: now }, $or: [{ state: 'pending' }, { state: 'processing', leaseUntil: { $lte: now } }]
  }).sort({ nextAttemptAt: 1 }).limit(Math.min(limit, 100)).lean());
  for (let offset = 0; offset < candidates.length; offset += 4) await Promise.all(candidates.slice(offset, offset + 4).map(candidate => run({ workspaceId: candidate.workspaceId }, async () => {
    const leaseToken = randomUUID();
    const job = await FileDeletionJob.findOneAndUpdate({ _id: candidate._id, nextAttemptAt: { $lte: now }, $or: [{ state: 'pending' }, { state: 'processing', leaseUntil: { $lte: now } }] }, { $set: { state: 'processing', leaseToken, leaseUntil: new Date(Date.now() + 60000) }, $inc: { attempts: 1 } }, { new: true });
    if (!job) return;
    try {
      // A shared asset is kept until its last metadata reference is removed.
      const retained = await Attachment.exists({ publicId: job.publicId });
      if (!retained) await deleteFromCloudinary(job.publicId, job.resourceType, { type: job.deliveryType, invalidate: true, timeout: 15000 });
      await FileDeletionJob.updateOne({ _id: job._id, leaseToken }, { $set: { state: 'completed', expiresAt: new Date(Date.now() + 30 * 86400000) }, $unset: { leaseToken: 1, leaseUntil: 1, lastErrorCode: 1 } });
    } catch (error) {
      await FileDeletionJob.updateOne({ _id: job._id, leaseToken }, { $set: { state: 'pending', nextAttemptAt: new Date(Date.now() + Math.min(3600000, 10000 * 2 ** Math.min(job.attempts, 8))), lastErrorCode: String(error.code || error.name || 'DELETE_FAILED') }, $unset: { leaseToken: 1, leaseUntil: 1 } });
    }
  })));
  return { checked: candidates.length };
}
