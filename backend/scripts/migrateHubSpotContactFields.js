import Board from '../models/Board.js';
import { digest, payloadFor, sourceHash } from '../modules/hubspot/domain.js';
import { run, runUnscoped } from '../modules/workspaces/workspaceContext.js';

// Baseline the expanded source signature without resetting a retry budget,
// reviving exhausted records or assigning new owners to old contacts.
export async function runHubSpotContactFieldsMigration() {
  await Board.createIndexes();
  let updated = 0;
  await runUnscoped(async () => {
    for await (const board of Board.find({ 'hubspotSync.version': { $exists: true }, 'hubspotSync.identityHash': { $exists: false } }).select('+hubspotSync').lean().cursor()) {
      await run({ workspaceId: board.workspaceId }, async () => {
        const hash = sourceHash(board);
        const result = await Board.updateOne({ _id: board._id, 'hubspotSync.version': board.hubspotSync.version, 'hubspotSync.hash': board.hubspotSync.hash }, { $set: {
          'hubspotSync.hash': hash, 'hubspotSync.identityHash': digest(payloadFor(board)),
          ...(board.hubspotSync.status === 'synced' ? { 'hubspotSync.lastSyncedHash': hash } : {}),
        } });
        updated += result.modifiedCount;
      });
    }
  });
  return { updated };
}
