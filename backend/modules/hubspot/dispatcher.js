import Board from '../../models/Board.js';
import Workspace from '../../models/Workspace.js';
import { HubSpotConnection } from './models.js';
import { run, runUnscoped } from '../workspaces/workspaceContext.js';
import { sourceState } from './domain.js';
import { hubspotQueue } from '../../queues/hubspotQueue.js';
import logger from '../../utils/logger.js';

const BATCH_SIZE = 100;
export async function backfillPage(connection) {
  const filter = { workspaceId: connection.workspaceId, projectType: 'Hired Client', isDeleted: { $ne: true },
    ...(connection.backfillCursor ? { _id: { $gt: connection.backfillCursor } } : {}),
  };
  const boards = await Board.find(filter).select('+hubspotSync').sort({ _id: 1 }).limit(BATCH_SIZE).lean();
  for (const board of boards) {
    const state = { ...sourceState(board, board.hubspotSync) };
    const sameAccount = !state.portalId || state.portalId === connection.portalId;
    // Exhaustion is tied to source version, not enable state or config key.
    // Configuration-only changes never reset its retry budget.
    if (sameAccount && state.status === 'failed') continue;
    if (sameAccount && state.status === 'synced' && state.lastSyncedHash === state.hash) continue;
    if (sameAccount && state.status === 'blocked' && state.configVersion === connection.version) continue;
    if (!sameAccount) {
      state.attempts = 0; state.lastSyncedHash = undefined; state.lastSyncedAt = undefined;
    }
    if (state.status === 'blocked' || !sameAccount) {
      state.status = 'pending'; state.nextAttemptAt = new Date(); state.error = ''; state.errorCode = '';
    }
    // Compare-and-set prevents a backfill from replacing a concurrent edit.
    await Board.updateOne({ _id: board._id, workspaceId: connection.workspaceId,
      ...(board.hubspotSync?.version ? { 'hubspotSync.version': board.hubspotSync.version, 'hubspotSync.status': board.hubspotSync.status, 'hubspotSync.attempts': board.hubspotSync.attempts } : { 'hubspotSync.version': { $exists: false } }),
    }, { $set: { hubspotSync: state } });
  }
  await HubSpotConnection.updateOne({ _id: connection._id, version: connection.version, enabled: true }, { $set: {
    backfillPending: boards.length === BATCH_SIZE, backfillCursor: boards.at(-1)?._id || connection.backfillCursor || null,
  } });
}

export async function dispatchHubSpotWork({ queue = hubspotQueue, onError = () => {} } = {}) {
  // Discovery is the only global connection read, and explicitly excludes
  // credentials. Execution resolves the active connection again under tenant ALS.
  const connections = await runUnscoped(async () => await HubSpotConnection.find({ enabled: true, status: 'connected' }).select('-credential').lean());
  for (const connection of connections) {
    try {
      if (!(await Workspace.exists({ _id: connection.workspaceId, isActive: true }))) continue;
      await run({ workspaceId: connection.workspaceId }, async () => {
        if (connection.backfillPending) await backfillPage(connection);
        const due = await Board.find({ workspaceId: connection.workspaceId, projectType: 'Hired Client', isDeleted: { $ne: true },
          'hubspotSync.status': { $in: ['pending', 'retrying'] }, 'hubspotSync.nextAttemptAt': { $lte: new Date() },
        }).select('_id hubspotSync').sort({ 'hubspotSync.nextAttemptAt': 1, _id: 1 }).limit(BATCH_SIZE).lean();
        for (const board of due) {
          const data = { workspaceId: String(connection.workspaceId), projectId: String(board._id), sourceVersion: board.hubspotSync.version,
            portalId: connection.portalId, configVersion: connection.version };
          await queue.add('sync-contact', data, { jobId: `hs-${data.workspaceId}-${data.projectId}-${data.sourceVersion}-${data.configVersion}-${board.hubspotSync.attempts}`, attempts: 1, removeOnComplete: true, removeOnFail: true });
        }
      });
    } catch (error) {
      logger.warn('HubSpot workspace dispatch deferred', { workspaceId: String(connection.workspaceId) });
      onError(error);
    }
  }
}
