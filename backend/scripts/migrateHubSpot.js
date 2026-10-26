import Board from '../models/Board.js';
import { HUBSPOT_MODELS } from '../modules/hubspot/models.js';
import { sourceState } from '../modules/hubspot/domain.js';
import { runUnscoped, run } from '../modules/workspaces/workspaceContext.js';

export async function runHubSpotMigration() {
  for (const model of HUBSPOT_MODELS) await model.createIndexes();
  await Board.createIndexes();
  let initialized = 0;
  await runUnscoped(async () => {
    for await (const board of Board.find({ 'hubspotSync.version': { $exists: false } }).select('+hubspotSync').lean().cursor()) {
      if (!board.workspaceId) continue;
      await run({ workspaceId: board.workspaceId }, async () => {
        const result = await Board.updateOne({ _id: board._id, 'hubspotSync.version': { $exists: false } }, { $set: { hubspotSync: sourceState(board) } });
        initialized += result.modifiedCount;
      });
    }
  });
  return { initialized, indexes: true };
}
