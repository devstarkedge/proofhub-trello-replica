import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { connectRedis, getSharedConnection, reportRedisError, workspaceKey, withTimeout } from '../queues/connection.js';
import { getActiveWorkspaceId } from '../modules/workspaces/workspaceContext.js';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const namespace = `announcement-read:${process.env.NODE_ENV || 'development'}:v1`;
const epochKey = `flowtask:${namespace}:epoch`;
const versionKey = workspaceId => workspaceKey(workspaceId, namespace, 'revision');
const pending = new Map();
const watched = new WeakMap();
const stats = { hit: 0, miss: 0, coalesced: 0, bypass: 0, invalidated: 0, stored: 0 };
const observations = new AsyncLocalStorage();
const count = name => { stats[name]++; const current = observations.getStore(); if (current) current[name] = (current[name] || 0) + 1; };
export async function observeAnnouncementRead(load) {
  const metrics = {};
  const started = performance.now();
  const data = await observations.run(metrics, load);
  return { data, metrics, durationMs: performance.now() - started };
}
let localRevision = 0;
export const announcementReadCacheStats = () => ({ ...stats, inFlight: pending.size });
const command = operation => withTimeout(operation, 250, 'Announcement cache');

// Reconnect rotates a shared namespace before reads resume. Writes performed
// during an outage cannot resurrect old data from the previous connection.
function readyClient() {
  let client;
  try { client = getSharedConnection(); } catch { return null; }
  if (client && ['wait', 'end'].includes(client.status)) {
    void connectRedis({cacheOnly:true}).catch(error => reportRedisError('announcement-cache', error));
  }
  if (!client || client.status !== 'ready') return null;
  if (!watched.has(client)) {
    const state = { ready: false, sequence: 0, retryAt: 0 };
    const rotate = () => {
      const sequence = ++state.sequence;
      state.ready = false;
      state.retryAt = Date.now() + 5000;
      state.initializing = command(client.set(epochKey, randomUUID())).then(() => {
        if (sequence === state.sequence && client.status === 'ready') state.ready = true;
      }).catch(error => reportRedisError('announcement-cache', error));
    };
    state.rotate = rotate;
    client.on('ready', rotate);
    client.on('close', () => { state.ready = false; state.sequence++; });
    watched.set(client, state);
    rotate();
  }
  const state = watched.get(client);
  if (!state.ready && Date.now() >= state.retryAt) state.rotate();
  return { client, state };
}

export async function invalidateAnnouncementReads(workspaceId) {
  if (!workspaceId) return;
  localRevision++;
  const ready = readyClient();
  if (!ready) return;
  try {
    await ready.state.initializing;
    if (!ready.state.ready) return;
    // A random token avoids ABA if Redis evicts a revision key. Old pages
    // become unreachable and disappear by their own short TTL, with no SCAN.
    await command(ready.client.set(versionKey(workspaceId), randomUUID(), 'EX', 3600));
    stats.invalidated++;
  } catch (error) { ready.state.ready = false; ready.state.retryAt = Date.now() + 5000; reportRedisError('announcement-cache', error); }
}

const storeIfCurrent = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
if (redis.call('GET', KEYS[2]) or '0') ~= ARGV[2] then return 0 end
redis.call('SET', KEYS[3], ARGV[3], 'PX', ARGV[4])
return 1`;

export async function cachedAnnouncementRead({ workspaceId, viewerId, kind, query, access, ttlMs = 15000, cache = true }, load) {
  const ready = cache ? readyClient() : null;
  let versions, key;
  try {
    if (ready) {
      await ready.state.initializing;
      if (ready.state.ready) {
        versions = await command(ready.client.mget(epochKey, versionKey(workspaceId)));
        if (versions[0] && !versions[1]) {
          // Eviction must create a new identity, never return to revision 0
          // where a pre-invalidation page might still exist for a few seconds.
          await command(ready.client.set(versionKey(workspaceId), randomUUID(), 'EX', 3600, 'NX'));
          versions = await command(ready.client.mget(epochKey, versionKey(workspaceId)));
        }
        if (versions[0] && versions[1]) {
          key = workspaceKey(workspaceId, `${namespace}:${kind}`, digest({ viewerId: String(viewerId), access,
            query: Object.fromEntries(Object.entries(query || {}).sort(([a], [b]) => a.localeCompare(b))), versions }));
          const cached = await command(ready.client.get(key));
          if (cached) {
            const value = JSON.parse(cached);
            if (value.validUntil > Date.now()) { count('hit'); return value.data; }
          }
        }
      }
    }
  } catch (error) { reportRedisError('announcement-cache', error); key = null; }
  if (!key) count('bypass');
  else count('miss');
  // Bypass still coalesces simultaneous reads locally; it retains no results
  // and cannot carry protected data across requests after the work completes.
  const flight = key || `${workspaceId}:${viewerId}:${kind}:${access}:${localRevision}:${digest(query)}`;
  if (pending.has(flight)) { count('coalesced'); return pending.get(flight); }
  const work = (async () => {
    const data = await load();
    if (key && ready.state.ready) {
      try {
        let validUntil = Date.now() + ttlMs;
        const serialized = JSON.stringify(data, (name, value) => {
          if (name === 'expiresAt' && value) validUntil = Math.min(validUntil, +new Date(value));
          return value;
        });
        const remaining = Math.floor(validUntil - Date.now());
        // Keep large history pages and image content out of Redis entirely.
        if (remaining > 0 && Buffer.byteLength(serialized) <= 128 * 1024) {
          const stored = await command(ready.client.eval(storeIfCurrent, 3, epochKey, versionKey(workspaceId), key,
            versions[0], versions[1] || '0', `{"validUntil":${validUntil},"data":${serialized}}`, remaining));
          stats.stored += Number(stored === 1);
        }
      } catch (error) { reportRedisError('announcement-cache', error); }
    }
    return data;
  })();
  if (pending.size < 64) pending.set(flight, work);
  try { return await work; } finally { if (pending.get(flight) === work) pending.delete(flight); }
}

// Invalidation belongs at the model boundary: uploads, recovery, edits,
// retention and direct service writes all run through these hooks.
export function announcementReadCachePlugin(schema) {
  schema.post('save', async function (doc) { await invalidateAnnouncementReads(doc.workspaceId); });
  schema.post('insertMany', async function (docs) {
    await Promise.all([...new Set(docs.map(doc => String(doc.workspaceId)))].map(invalidateAnnouncementReads));
  });
  schema.post(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'], async function (result) {
    const update = this.getUpdate?.();
    // Engagement changes are excluded from feed projections and unread counts
    // are read fresh; they must not evict the feed for every visible card.
    if (update && !this.getOptions().upsert && Object.entries(update).filter(([operator]) => operator !== '$setOnInsert').every(([operator, fields]) =>
      operator.startsWith('$') && Object.keys(fields).every(field => ['updatedAt', '__v', 'seenBy', 'readBy', 'viewCount', 'acknowledgedBy'].includes(field)))) return;
    const workspaceId = getActiveWorkspaceId() || result?.workspaceId || this.getFilter()?.workspaceId;
    if (workspaceId) await invalidateAnnouncementReads(workspaceId);
  });
}
