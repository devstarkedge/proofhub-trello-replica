import { captureRequestScope, requestScopeKey, assertRequestScope } from './requestScope.mjs';

// Short-lived display reads only. Authorization and mutations always reach the server.
export function createScopedReadCache({ storage, ttlMs = 30000, maxEntries = 12, maxBytes = 1024 * 1024, now = Date.now }) {
  const entries = new Map();
  let revision = 0;
  return {
    clear() { revision++; entries.clear(); },
    peek(key, { staleMs = 0 } = {}) {
      const scope = captureRequestScope(storage);
      const entry = entries.get(`${requestScopeKey(scope)}:${key}`);
      if (!entry?.expiresAt || entry.expiresAt + staleMs <= now()) return null;
      assertRequestScope(storage, scope);
      return { value: entry.value, stale: entry.expiresAt <= now() };
    },
    deletePending(key, scope = captureRequestScope(storage)) {
      const cacheKey = `${requestScopeKey(scope)}:${key}`;
      const entry = entries.get(cacheKey);
      if (entry?.flight) {
        if (entry.expiresAt) entries.set(cacheKey, { value: entry.value, expiresAt: entry.expiresAt });
        else entries.delete(cacheKey);
      }
    },
    read(key, load, { force = false, ttlMs: readTtlMs = ttlMs, expiresAt } = {}) {
      const scope = captureRequestScope(storage);
      const cacheKey = `${requestScopeKey(scope)}:${key}`;
      const existing = entries.get(cacheKey);
      if (existing?.flight) return existing.flight;
      if (!force && existing?.expiresAt > now()) return Promise.resolve().then(() => {
        assertRequestScope(storage, scope);
        return existing.value;
      });
      const generation = revision;
      // Keep a bounded previous display snapshot available during revalidation.
      // It never counts as a fresh read and clear() removes it immediately.
      const entry = existing?.expiresAt ? { value: existing.value, expiresAt: existing.expiresAt } : {};
      entries.delete(cacheKey);
      while (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
      entries.set(cacheKey, entry);
      entry.flight = Promise.resolve().then(load).then(value => {
        assertRequestScope(storage, scope);
        if (readTtlMs > 0 && generation === revision && entries.get(cacheKey) === entry) {
          const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
          if (bytes <= maxBytes) { entry.value = value; entry.expiresAt = Math.min(now() + readTtlMs, expiresAt ? expiresAt(value) : Infinity); }
          else entries.delete(cacheKey);
        }
        return value;
      }).finally(() => {
        entry.flight = null;
        if (!entry.expiresAt && entries.get(cacheKey) === entry) entries.delete(cacheKey);
      });
      return entry.flight;
    }
  };
}
