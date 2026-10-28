import Board from '../models/Board.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import { deleteResource } from '../services/resourceDeletion.js';
const CLEANUP_THRESHOLD_MS = 30 * 1000;
export async function permanentlyDeleteBoards(boardIds, { cutoff = new Date(Date.now() - CLEANUP_THRESHOLD_MS) } = {}) {
  if (!boardIds?.length) return { deleted: 0 };
  let deleted = 0;
  await workspaceContext.runUnscoped(async () => {
    const cursor = Board.find({ _id: { $in: boardIds }, isDeleted: true, deletedAt: { $lte: cutoff } }).select('_id workspaceId').lean().cursor();
    for await (const board of cursor) {
      const result = await workspaceContext.run({ workspaceId: board.workspaceId }, () => deleteResource('board', board._id, { requireDeletedBefore: cutoff }));
      if (result.deleted) deleted += 1;
    }
  });
  return { deleted };
}
export async function cleanupSoftDeletedBoards() {
  const cutoff = new Date(Date.now() - CLEANUP_THRESHOLD_MS);
  await workspaceContext.runUnscoped(async () => {
    const cursor = Board.find({ isDeleted: true, deletedAt: { $lte: cutoff } }).select('_id workspaceId').lean().cursor();
    for await (const board of cursor) {
      try {
        await workspaceContext.run({ workspaceId: board.workspaceId }, () => deleteResource('board', board._id, { requireDeletedBefore: cutoff }));
      } catch (error) { console.error('Project cleanup failed', { id: String(board._id), code: error.code || error.name }); }
    }
  });
}
export const startBoardCleanup = () => {};
export const stopBoardCleanup = () => {};
export default { permanentlyDeleteBoards, cleanupSoftDeletedBoards, startBoardCleanup, stopBoardCleanup };
