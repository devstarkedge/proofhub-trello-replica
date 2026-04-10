import mongoose from 'mongoose';
import Card from '../models/Card.js';
import Attachment from '../models/Attachment.js';
import Comment from '../models/Comment.js';
import Activity from '../models/Activity.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import RecurringTask from '../models/RecurringTask.js';

let isRunningCleanup = false;

/**
 * Remove archived cards that have passed their auto-delete deadline along with related data.
 * This relies solely on persisted timestamps so it survives restarts and is idempotent.
 */
export const cleanupExpiredArchivedCards = async () => {
  if (isRunningCleanup) {
    return;
  }

  isRunningCleanup = true;
  const now = new Date();

  try {
    const candidates = await Card.find({
      isArchived: true,
      autoDeleteAt: { $lte: now }
    }).select('_id board list title').lean();

    if (!candidates.length) {
      return;
    }

    for (const card of candidates) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const subtaskIds = await Subtask.distinct('_id', { task: card._id }).session(session);
          const nanoIds = await SubtaskNano.distinct('_id', { task: card._id }).session(session);
          const relatedRefs = [card._id, ...subtaskIds, ...nanoIds].filter(Boolean);

          await Attachment.deleteMany({
            $or: [
              { card: card._id },
              { subtask: { $in: subtaskIds } },
              { nanoSubtask: { $in: nanoIds } },
              { contextRef: { $in: relatedRefs } }
            ]
          }, { session });

          await Comment.deleteMany({
            $or: [
              { card: card._id },
              { contextRef: { $in: relatedRefs } }
            ]
          }, { session });

          await Activity.deleteMany({ card: card._id }, { session });
          await RecurringTask.deleteMany({ card: card._id }, { session });
          await SubtaskNano.deleteMany({ task: card._id }, { session });
          await Subtask.deleteMany({ task: card._id }, { session });

          await Card.deleteOne({ _id: card._id }, { session });
        });

        console.log(`Archived card auto-deleted: ${card._id} (${card.title || 'untitled'})`);
      } catch (err) {
        console.error(`Failed to auto-delete archived card ${card._id}:`, err);
      } finally {
        await session.endSession();
      }
    }
  } catch (err) {
    console.error('Error during archived card cleanup scan:', err);
  } finally {
    isRunningCleanup = false;
  }
};

// Legacy no-ops — polling replaced by BullMQ repeatable jobs via maintenanceScheduler
export const startArchivedCardCleanup = () => {};
export const stopArchivedCardCleanup = () => {};

export default { cleanupExpiredArchivedCards, startArchivedCardCleanup, stopArchivedCardCleanup };
