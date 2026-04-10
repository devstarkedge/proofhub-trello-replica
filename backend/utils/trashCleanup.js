import Attachment from '../models/Attachment.js';
import Activity from '../models/Activity.js';
import { deleteMultipleFromCloudinary } from './cloudinary.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 30;

export const cleanupTrashedAttachments = async (retentionDays = DEFAULT_RETENTION_DAYS) => {
  const threshold = new Date(Date.now() - retentionDays * ONE_DAY_MS);
  try {
    const candidates = await Attachment.find({ isDeleted: true, deletedAt: { $lte: threshold } })
      .select('_id publicId resourceType board card subtask nanoSubtask fileName originalName')
      .lean();
    if (!candidates.length) return;

    const imageIds = candidates.filter(a => a.resourceType === 'image').map(a => a.publicId);
    const rawIds = candidates.filter(a => a.resourceType !== 'image').map(a => a.publicId);

    try {
      if (imageIds.length) await deleteMultipleFromCloudinary(imageIds, 'image');
      if (rawIds.length) await deleteMultipleFromCloudinary(rawIds, 'raw');
    } catch (e) {
      console.error('Cloudinary cleanup error:', e);
    }

    const ids = candidates.map(c => c._id);
    await Attachment.deleteMany({ _id: { $in: ids } });

    // Optional: create project-level activity summarizing cleanup
    for (const a of candidates) {
      try {
        await Activity.create({
          type: 'attachment_permanently_deleted',
          description: `Auto-cleanup permanently deleted: ${a.originalName || a.fileName}`,
          user: null,
          board: a.board,
          card: a.card || undefined,
          subtask: a.subtask || undefined,
          nanoSubtask: a.nanoSubtask || undefined,
          contextType: 'card'
        });
      } catch (e) {
        // ignore
      }
    }
  } catch (err) {
    console.error('Trash cleanup error:', err);
  }
};

// Legacy no-ops — polling replaced by BullMQ repeatable jobs via maintenanceScheduler
export const startTrashCleanup = () => {};
export const stopTrashCleanup = () => {};

export default { cleanupTrashedAttachments, startTrashCleanup, stopTrashCleanup };
