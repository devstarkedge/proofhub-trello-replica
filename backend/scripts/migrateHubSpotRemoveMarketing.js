import Board from '../models/Board.js';
import { sourceHash } from '../modules/hubspot/domain.js';
import { run, runUnscoped } from '../modules/workspaces/workspaceContext.js';

// Remove the retired marketing field from persisted change signatures without
// replaying exhausted source versions or changing client data/contact mappings.
export async function runHubSpotRemoveMarketingMigration() {
  let updated = 0;
  await runUnscoped(async () => {
    for await (const board of Board.find({ 'hubspotSync.version': { $exists: true } }).select('+hubspotSync').lean().cursor()) {
      if (!board.workspaceId) continue;
      await run({ workspaceId: board.workspaceId }, async () => {
        const previous = board.hubspotSync;
        const hash = sourceHash(board);
        const values = { 'hubspotSync.hash': hash };
        if (previous.lastSyncedHash === previous.hash) values['hubspotSync.lastSyncedHash'] = hash;
        if (previous.status === 'blocked' && ['MARKETING_STATUS_READ_ONLY', 'MARKETING_PROPERTY'].includes(previous.errorCode) && previous.attempts < 4) {
          Object.assign(values, { 'hubspotSync.status': 'pending', 'hubspotSync.nextAttemptAt': new Date(), 'hubspotSync.error': '', 'hubspotSync.errorCode': '' });
        }
        const result = await Board.updateOne({ _id: board._id, 'hubspotSync.version': previous.version, 'hubspotSync.hash': previous.hash, 'hubspotSync.status': previous.status, 'hubspotSync.attempts': previous.attempts }, { $set: values });
        updated += result.modifiedCount;
      });
    }
  });
  return { updated };
}
