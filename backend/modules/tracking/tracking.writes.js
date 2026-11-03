import { setTimeout as delay } from 'node:timers/promises';

// Coordinate this process's heartbeat, work and interval writes for one actor.
// MongoDB's transaction/CAS fences still enforce correctness across processes.
const writes = new Map();
export function serializeTrackingWrite(workspaceId, userId, run) {
  const key = `${workspaceId}:${userId}`;
  const operation = (writes.get(key) || Promise.resolve()).then(run);
  const settled = operation.then(() => {}, () => {});
  writes.set(key, settled);
  settled.then(() => { if (writes.get(key) === settled) writes.delete(key); });
  return operation;
}

export async function withTrackingTransaction(session, run, { attempts = 4, sleep = delay } = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return await session.withTransaction(run); }
    catch (error) {
      // The driver retries labeled transaction errors and ambiguous commits.
      // Some deployments also return an unlabeled WriteConflict (112). Only
      // that known-aborted transaction can safely be retried as a whole here.
      const ambiguous = error.hasErrorLabel?.('UnknownTransactionCommitResult') || error.errorLabels?.includes('UnknownTransactionCommitResult');
      const labeled = error.hasErrorLabel?.('TransientTransactionError') || error.errorLabels?.includes('TransientTransactionError');
      if (error.code !== 112 || ambiguous || labeled || attempt + 1 >= attempts) throw error;
      await sleep(25 * 2 ** attempt);
    }
  }
}
