import Board from '../models/Board.js';
import List from '../models/List.js';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import Comment from '../models/Comment.js';
import Attachment from '../models/Attachment.js';
import Label from '../models/Label.js';
import Activity from '../models/Activity.js';
import RecurringTask from '../models/RecurringTask.js';
import Reminder from '../models/Reminder.js';
import Department from '../models/Department.js';
import Notification from '../models/Notification.js';
import { invalidateCache } from '../middleware/cache.js';

// Default: permanently delete boards soft-deleted more than 30 seconds ago
const CLEANUP_THRESHOLD_MS = 30 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000; // Run every 60 seconds
let cleanupIntervalId = null;

/**
 * Permanently delete boards and all related data in batched operations.
 * Designed for high performance — uses $in queries instead of per-board loops.
 * @param {string[]} boardIds - Array of board ObjectIds to permanently delete
 */
export const permanentlyDeleteBoards = async (boardIds) => {
  if (!boardIds || boardIds.length === 0) return { deleted: 0 };

  try {
    // 1. Fetch all boards to know their departments (for cleanup)
    const boards = await Board.find({ _id: { $in: boardIds } })
      .select('_id department coverImage')
      .lean();

    if (boards.length === 0) return { deleted: 0 };

    const actualBoardIds = boards.map(b => b._id);

    // 2. Collect all card IDs and subtask IDs in bulk
    const [cards, subtasks] = await Promise.all([
      Card.find({ board: { $in: actualBoardIds } }).select('_id').lean(),
      Subtask.find({ board: { $in: actualBoardIds } }).select('_id').lean()
    ]);

    const cardIds = cards.map(c => c._id);
    const subtaskIds = subtasks.map(s => s._id);

    // 3. Perform all cascade deletions in parallel where independent
    const deleteOps = [
      // Delete nano subtasks (depends on subtaskIds)
      subtaskIds.length > 0
        ? SubtaskNano.deleteMany({ subtask: { $in: subtaskIds } })
        : Promise.resolve(),
      // Delete subtasks
      Subtask.deleteMany({ board: { $in: actualBoardIds } }),
      // Delete labels
      Label.deleteMany({ board: { $in: actualBoardIds } }),
      // Delete reminders
      Reminder.deleteMany({ project: { $in: actualBoardIds } }),
      // Delete activities
      Activity.deleteMany({ board: { $in: actualBoardIds } }),
      // Delete lists
      List.deleteMany({ board: { $in: actualBoardIds } }),
    ];

    // Card-dependent deletions
    if (cardIds.length > 0) {
      deleteOps.push(
        Comment.deleteMany({ card: { $in: cardIds } }),
        Attachment.deleteMany({ card: { $in: cardIds } }),
        RecurringTask.deleteMany({ card: { $in: cardIds } }),
        Card.deleteMany({ board: { $in: actualBoardIds } })
      );
    }

    await Promise.all(deleteOps);

    // 4. Remove boards from departments' projects arrays (grouped by department)
    const deptMap = {};
    for (const board of boards) {
      if (board.department) {
        const deptId = board.department.toString();
        if (!deptMap[deptId]) deptMap[deptId] = [];
        deptMap[deptId].push(board._id);
      }
    }

    await Promise.all(
      Object.entries(deptMap).map(([deptId, ids]) =>
        Department.findByIdAndUpdate(deptId, {
          $pullAll: { projects: ids }
        })
      )
    );

    // 5. Delete the boards themselves
    await Board.deleteMany({ _id: { $in: actualBoardIds } });

    // 6. Invalidate caches
    invalidateCache('/api/boards');
    invalidateCache('/api/departments');
    for (const deptId of Object.keys(deptMap)) {
      invalidateCache(`/api/boards/department/${deptId}`);
    }

    console.log(`[BoardCleanup] Permanently deleted ${actualBoardIds.length} boards and all related data.`);
    return { deleted: actualBoardIds.length };
  } catch (error) {
    console.error('[BoardCleanup] Error during permanent deletion:', error);
    throw error;
  }
};

/**
 * Find and permanently delete boards that were soft-deleted beyond the threshold.
 */
export const cleanupSoftDeletedBoards = async () => {
  const threshold = new Date(Date.now() - CLEANUP_THRESHOLD_MS);

  try {
    const candidates = await Board.find({
      isDeleted: true,
      deletedAt: { $lte: threshold }
    })
      .select('_id')
      .lean();

    if (candidates.length === 0) return;

    const boardIds = candidates.map(c => c._id);
    await permanentlyDeleteBoards(boardIds);
  } catch (error) {
    console.error('[BoardCleanup] Scheduled cleanup error:', error);
  }
};

/**
 * Start the periodic cleanup scheduler.
 */
export const startBoardCleanup = (intervalMs = CLEANUP_INTERVAL_MS) => {
  if (cleanupIntervalId) return cleanupIntervalId;

  // Run once on startup after a short delay
  setTimeout(() => {
    cleanupSoftDeletedBoards().catch(() => {});
  }, 5000);

  cleanupIntervalId = setInterval(() => {
    cleanupSoftDeletedBoards().catch(() => {});
  }, intervalMs);

  console.log('Board cleanup scheduler started (interval: ' + intervalMs / 1000 + 's)');
  return cleanupIntervalId;
};

/**
 * Stop the periodic cleanup scheduler.
 */
export const stopBoardCleanup = () => {
  if (cleanupIntervalId) clearInterval(cleanupIntervalId);
  cleanupIntervalId = null;
};

export default { permanentlyDeleteBoards, cleanupSoftDeletedBoards, startBoardCleanup, stopBoardCleanup };
