import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { connectRedis, getSharedConnection, reportRedisError, workspaceKey, withTimeout } from '../queues/connection.js';
import { getActiveContext } from '../modules/workspaces/workspaceContext.js';

// Resource caches share the Redis connection and one pair of lifecycle listeners.
const connectionWatchers = new WeakMap();

export function createVersionedReadCache(group, { observations = new AsyncLocalStorage() } = {}) {
  const digest = value => createHash('sha256').update(JSON.stringify(value, (_key, item) =>
    item && Object.getPrototypeOf(item) === Object.prototype ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)).digest('hex');
  const namespace = `${group}:${process.env.NODE_ENV || 'development'}:v1`;
  const epochKey = `flowtask:${namespace}:epoch`;
  const versionKey = workspaceId => workspaceKey(workspaceId, namespace, 'revision');
  const pending = new Map();
  const watched = new WeakMap();
  const stats = { hit: 0, miss: 0, coalesced: 0, bypass: 0, invalidated: 0, stored: 0,
    cold: 0, expired: 0, refresh: 0, unavailable: 0, readError: 0, oversized: 0, superseded: 0 };
  const count = name => { stats[name]++; const current = observations.getStore(); if (current) current[name] = (current[name] || 0) + 1; };
  const freshness = validUntil => {
    const current = observations.getStore();
    if (current) current.freshUntil = Math.min(current.freshUntil ?? Infinity, validUntil);
  };
  async function observe(load) {
    const metrics = {};
    const started = performance.now();
    const data = await observations.run(metrics, load);
    return { data, metrics, durationMs: performance.now() - started };
  }
  let localRevision = 0;
  const statsSnapshot = () => ({ ...stats, inFlight: pending.size });
  // initCommand: used only for epoch SET on reconnect; hosted Redis (e.g. RedisLabs Mumbai)
  // can take >250ms on a cold connection so we allow more time here without slowing down
  // actual cache reads that fall back to MongoDB on any delay.
  const initCommand = operation => withTimeout(operation, 1500, 'Tracking cache init');
  // command: used for per-request reads/writes where MongoDB fallback is acceptable.
  const command = operation => withTimeout(operation, 250, 'Tracking cache');

  // Reconnect rotates a shared namespace before reads resume. Writes performed
  // during an outage cannot resurrect old data from the previous connection.
  function readyClient() {
    let client;
    try { client = getSharedConnection(); } catch { return null; }
    if (client && ['wait', 'end'].includes(client.status)) {
      void connectRedis({cacheOnly:true}).catch(error => reportRedisError(group, error));
    }
    if (!client || client.status !== 'ready') return null;
    if (!watched.has(client)) {
      const state = { ready: false, sequence: 0, retryAt: 0 };
      const rotate = () => {
        const sequence = ++state.sequence;
        state.ready = false;
        state.retryAt = Date.now() + 5000;
        state.initializing = initCommand(client.set(epochKey, randomUUID())).then(() => {
          if (sequence === state.sequence && client.status === 'ready') state.ready = true;
        }).catch(error => reportRedisError(group, error));
      };
      state.rotate = rotate;
      if (!connectionWatchers.has(client)) {
        const listeners = new Set(); connectionWatchers.set(client, listeners);
        client.on('ready', () => { for (const listener of listeners) listener.ready(); });
        client.on('close', () => { for (const listener of listeners) listener.close(); });
      }
      connectionWatchers.get(client).add({ ready: rotate, close: () => { state.ready = false; state.sequence++; } });
      watched.set(client, state);
      rotate();
    }
    const state = watched.get(client);
    if (!state.ready && Date.now() >= state.retryAt) state.rotate();
    return { client, state };
  }

  async function invalidate(workspaceId) {
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
    } catch (error) { ready.state.ready = false; ready.state.retryAt = Date.now() + 5000; reportRedisError(group, error); }
  }

  const storeIfCurrent = `
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
  if (redis.call('GET', KEYS[2]) or '0') ~= ARGV[2] then return 0 end
  redis.call('SET', KEYS[3], ARGV[3], 'PX', ARGV[4])
  return 1`;

  async function read({ workspaceId, viewerId, kind, query, access, ttlMs = 30000 }, load) {
    if (!workspaceId) return load();
    const ready = getActiveContext()?.bypassBusinessReadCache ? null : readyClient();
    let versions, key;
    try {
      if (ready) {
        await ready.state.initializing;
        if (ready.state.ready) {
          versions = await command(ready.client.mget(epochKey, versionKey(workspaceId)));
          if (versions[0] && !versions[1]) {
            // Missing/evicted revision keys get a new identity. Never reuse a
            // historical zero-version payload after revision eviction/expiry.
            await command(ready.client.set(versionKey(workspaceId), randomUUID(), 'EX', 3600, 'NX'));
            versions = await command(ready.client.mget(epochKey, versionKey(workspaceId)));
          }
          if (versions[0] && versions[1]) {
            key = workspaceKey(workspaceId, `${namespace}:${kind}`, digest({ viewerId: String(viewerId), access,
              query: Object.fromEntries(Object.entries(query || {}).sort(([a], [b]) => a.localeCompare(b))), versions }));
          }
        }
      }
    } catch (error) { count('readError'); reportRedisError(group, error); key = null; }
    // Bypass still coalesces simultaneous reads locally; it retains no results
    // and cannot carry protected data across requests after the work completes.
    const flight = digest({ key, workspaceId: String(workspaceId), viewerId: String(viewerId), kind, access, query, localRevision });
    if (pending.has(flight)) {
      count('coalesced'); const result = await pending.get(flight);
      freshness(result.validUntil); return result.data;
    }
    const work = (async () => {
      // Keep revision checks fresh across processes; coalesce only the subsequent
      // payload lookup/load for an identical authorized revision.
      if (key) {
        try {
          const cached = await command(ready.client.get(key));
          if (cached) {
            const value = JSON.parse(cached);
            if (value.validUntil > Date.now()) { count('hit'); return value; }
            count('expired');
          } else count('cold');
        } catch (error) { count('readError'); reportRedisError(group, error); key = null; }
      }
      if (!key) { count('bypass'); count(getActiveContext()?.bypassBusinessReadCache ? 'refresh' : 'unavailable'); }
      else count('miss');
      const data = await load();
      let validUntil = Date.now() + Math.max(0, Number(typeof ttlMs === 'function' ? ttlMs(data) : ttlMs) || 0);
      if (key && ready.state.ready) {
        try {
          const serialized = JSON.stringify(data, (name, value) => {
            if (name === 'expiresAt' && value) validUntil = Math.min(validUntil, +new Date(value));
            return value;
          });
          const remaining = Math.floor(validUntil - Date.now());
          // Keep large history pages and image content out of Redis entirely.
          if (remaining > 0 && Buffer.byteLength(serialized) <= 512 * 1024) {
            const stored = await command(ready.client.eval(storeIfCurrent, 3, epochKey, versionKey(workspaceId), key,
              versions[0], versions[1] || '0', `{"validUntil":${validUntil},"data":${serialized}}`, remaining));
            stats.stored += Number(stored === 1);
            if (stored !== 1) { count('superseded'); validUntil = 0; }
          } else if (Buffer.byteLength(serialized) > 512 * 1024) count('oversized');
        } catch (error) { validUntil = 0; reportRedisError(group, error); }
      }
      return { data, validUntil };
    })();
    if (pending.size < 64) pending.set(flight, work);
    try { const result = await work; freshness(result.validUntil); return result.data; }
    finally { if (pending.get(flight) === work) pending.delete(flight); }
  }


  return { read, invalidate, observe, stats: statsSnapshot };
}
