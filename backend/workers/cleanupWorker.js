/**
 * Cleanup Worker
 * 
 * Processes jobs from the 'flowtask:cleanup' queue.
 * Handles trash cleanup (permanently delete attachments after 30 days).
 * Job type: cleanup-trash
 */
import { Worker } from 'bullmq';
import { getWorkerConnection } from '../queues/connection.js';
import Attachment from '../models/Attachment.js';
import { deleteMultipleFromCloudinary } from '../utils/cloudinary.js';
import config from '../config/index.js';

const JOB_HANDLERS = {
  /**
   * Permanently delete attachments that have been in trash for 30+ days.
   */
  async 'cleanup-trash'(job) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const trashItems = await Attachment.find({
      isDeleted: true,
      deletedAt: { $lte: thirtyDaysAgo },
    }).lean();

    if (trashItems.length === 0) {
      return { deleted: 0, message: 'No items to clean up' };
    }

    console.log(`[CleanupWorker] Found ${trashItems.length} items to permanently delete`);

    // Separate by resource type for batch Cloudinary deletion
    const imageIds = trashItems
      .filter((a) => a.resourceType === 'image')
      .map((a) => a.publicId);
    const rawIds = trashItems
      .filter((a) => a.resourceType !== 'image')
      .map((a) => a.publicId);

    // Delete from Cloudinary
    try {
      if (imageIds.length > 0) {
        await deleteMultipleFromCloudinary(imageIds, 'image');
        console.log(`[CleanupWorker] Deleted ${imageIds.length} images from Cloudinary`);
      }
      if (rawIds.length > 0) {
        await deleteMultipleFromCloudinary(rawIds, 'raw');
        console.log(`[CleanupWorker] Deleted ${rawIds.length} raw files from Cloudinary`);
      }
    } catch (error) {
      console.error('[CleanupWorker] Cloudinary deletion error:', error.message);
    }

    // Delete from MongoDB
    const result = await Attachment.deleteMany({
      _id: { $in: trashItems.map((a) => a._id) },
    });

    console.log(`[CleanupWorker] Permanently deleted ${result.deletedCount} attachments`);
    return { deleted: result.deletedCount, total: trashItems.length };
  },
};

// ─── Worker Creation ──────────────────────────────────────────────────────────

let cleanupWorker = null;

export function startCleanupWorker() {
  cleanupWorker = new Worker(
    'flowtask.cleanup',
    async (job) => {
      const handler = JOB_HANDLERS[job.name];
      if (!handler) {
        throw new Error(`Unknown cleanup job type: ${job.name}`);
      }
      return handler(job);
    },
    {
      connection: getWorkerConnection(),
      concurrency: 1,
    }
  );

  cleanupWorker.on('completed', (job, result) => {
    if (config.isDev) console.log(`[CleanupWorker] Job ${job.id} completed:`, result);
  });

  cleanupWorker.on('failed', (job, err) => {
    console.error(`[CleanupWorker] Job ${job?.id} failed:`, err.message);
  });

  console.log('[CleanupWorker] Started');
  return cleanupWorker;
}

export function getCleanupWorker() {
  return cleanupWorker;
}
