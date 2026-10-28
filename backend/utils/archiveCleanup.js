import Card from '../models/Card.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import { deleteResource } from '../services/resourceDeletion.js';
let running;
export function cleanupExpiredArchivedCards() {
  if (!running) running = scan().finally(() => { running = null; });
  return running;
}
async function scan() {
  const cutoff = new Date();
  await workspaceContext.runUnscoped(async () => {
    const cursor = Card.find({ isArchived: true, autoDeleteAt: { $lte: cutoff } }).select('_id workspaceId').lean().cursor();
    for await (const card of cursor) {
      try {
        await workspaceContext.run({ workspaceId: card.workspaceId }, () => deleteResource('card', card._id, { requireExpiredAt: cutoff }));
      } catch (error) { console.error('Archived task cleanup failed', { id: String(card._id), code: error.code || error.name }); }
    }
  });
}
export const startArchivedCardCleanup = () => {};
export const stopArchivedCardCleanup = () => {};
export default { cleanupExpiredArchivedCards, startArchivedCardCleanup, stopArchivedCardCleanup };
