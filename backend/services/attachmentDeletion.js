import mongoose from 'mongoose';
import Attachment from '../models/Attachment.js';
import FileDeletionJob from '../models/FileDeletionJob.js';

export async function permanentlyDeleteAttachments(ids, { deletedBefore } = {}) {
  const session = await mongoose.startSession();
  let removed = [];
  try {
    await session.withTransaction(async () => {
      removed = await Attachment.find({ _id: { $in: ids }, isDeleted: true, ...(deletedBefore ? { deletedAt: { $lte: deletedBefore } } : {}) }).session(session).lean();
      for (const asset of removed) await FileDeletionJob.findOneAndUpdate({ publicId: asset.publicId, resourceType: asset.resourceType === 'auto' ? 'raw' : asset.resourceType, deliveryType: asset.deliveryType || 'upload' }, { $set: { state: 'pending', nextAttemptAt: new Date() }, $setOnInsert: { workspaceId: asset.workspaceId }, $unset: { expiresAt: 1 } }, { upsert: true, session, setDefaultsOnInsert: true });
      await Attachment.deleteMany({ _id: { $in: removed.map(asset => asset._id) }, isDeleted: true }, { session });
    });
  } finally { await session.endSession(); }
  return removed;
}
