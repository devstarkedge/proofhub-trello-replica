import { randomUUID } from 'node:crypto';
import { HubSpotLock } from './models.js';
import { SyncError } from './domain.js';

const LEASE_MS = 120_000;
export async function withHubSpotLock(key, work) {
  const owner = randomUUID();
  try { await HubSpotLock.updateOne({ _id: key }, { $setOnInsert: { expiresAt: new Date(0) } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  const lock = await HubSpotLock.findOneAndUpdate({ _id: key, expiresAt: { $lte: new Date() } }, {
    $set: { owner, expiresAt: new Date(Date.now() + LEASE_MS) },
  }, { new: true }).lean();
  if (!lock) throw new SyncError('BUSY', 'Synchronization is in progress. Please try the change again shortly.', { status: 409 });
  // Do not silently renew expired leases: an old process must stop before
  // any further request, even when another instance has taken over.
  const assertOwned = async () => {
    const result = await HubSpotLock.updateOne({ _id: key, owner, expiresAt: { $gt: new Date(Date.now() + 15_000) } }, {
      $set: { expiresAt: new Date(Date.now() + LEASE_MS) },
    });
    if (!result.matchedCount) throw new SyncError('STALE_JOB', 'The synchronization lease expired.');
  };
  try { return await work({ assertOwned, key, owner }); }
  finally { await HubSpotLock.updateOne({ _id: key, owner }, { $set: { expiresAt: new Date(0) }, $unset: { owner: 1 } }); }
}
export async function paceAccount(lease) {
  await lease.assertOwned();
  const lock = await HubSpotLock.findOne({ _id: lease.key, owner: lease.owner }).lean();
  const allowed = Math.max(+lock?.nextRequestAt || 0, +lock?.cooldownUntil || 0);
  if (allowed > Date.now() + 1000) throw new SyncError('ACCOUNT_COOLDOWN', 'The HubSpot account is waiting for its rate limit window.', { retryAfter: allowed });
  if (allowed > Date.now()) await new Promise(resolve => setTimeout(resolve, allowed - Date.now()));
  await lease.assertOwned();
  await HubSpotLock.updateOne({ _id: lease.key, owner: lease.owner }, { $set: { nextRequestAt: new Date(Date.now() + 250) } });
}
