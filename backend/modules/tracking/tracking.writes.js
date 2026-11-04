import { setTimeout as delay } from 'node:timers/promises';

// Coordinate this process's heartbeat, work and interval writes for one actor.
// MongoDB's transaction/CAS fences still enforce correctness across processes.
const writes = new Map();
const labeled = (error, label) => Boolean(error?.hasErrorLabel?.(label) || error?.errorLabels?.includes(label));
const busy = () => Object.assign(new Error('Tracking is busy; reconnecting shortly.'), { statusCode: 503, code: 'TRACKING_BUSY' });

export function serializeTrackingWrite(workspaceId, userId, run, { maxWaitMs = Infinity, now = Date.now } = {}) {
  const key = `${workspaceId}:${userId}`;
  const queuedAt = now();
  const operation = (writes.get(key) || Promise.resolve()).then(() => {
    // A timed-out desktop heartbeat must not renew an obsolete lease minutes
    // later or keep newer heartbeats queued behind it. Work changes retain
    // their operation receipts and are never discarded by this deadline.
    if (now() - queuedAt >= maxWaitMs) throw busy();
    return run();
  });
  const settled = operation.then(() => {}, () => {});
  writes.set(key, settled);
  settled.then(() => { if (writes.get(key) === settled) writes.delete(key); });
  return operation;
}

export async function withTrackingTransaction(session, run, { attempts = 4, sleep = delay, budgetMs = 10000, now = Date.now } = {}) {
  const started = now();
  for (let attempt = 0; ; attempt++) {
    session.startTransaction({ maxCommitTimeMS: 5000 });
    try {
      const result = await run(session);
      // An operation receipt may explicitly abort its read-only replay.
      if (!session.inTransaction()) return result;
      for (let commit = 0; ; commit++) {
        try { await session.commitTransaction(); return result; }
        catch (error) {
          // An unknown commit can only retry COMMIT on this transaction.
          // Re-running the body could duplicate an already committed write.
          if (!labeled(error, 'UnknownTransactionCommitResult') || commit + 1 >= attempts || now() - started >= budgetMs) throw error;
          await sleep(25 * 2 ** commit);
        }
      }
    }
    catch (error) {
      if (session.inTransaction()) await session.abortTransaction().catch(() => {});
      // The installed driver's withTransaction retries for 120 seconds with
      // no backoff. Under contention that starves every queued actor request.
      // Retry only a known-aborted transaction, with our own bounded budget.
      if (labeled(error, 'UnknownTransactionCommitResult') || !(error.code === 112 || labeled(error, 'TransientTransactionError')) || attempt + 1 >= attempts || now() - started >= budgetMs) throw error;
      await sleep(25 * 2 ** attempt);
    }
  }
}
