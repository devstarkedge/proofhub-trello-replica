import { captureRequestScope, requestScopeKey, assertRequestScope } from './requestScope.mjs';

// Short-lived display reads only. Authorization and mutations always reach the server.
export function createScopedReadCache({ storage, ttlMs = 30000, maxEntries = 12, maxBytes = 1024 * 1024, now = Date.now }) {
  const entries = new Map();
  let revision = 0;
  return {
    clear() { revision++; entries.clear(); },
    read(key, load, { force = false } = {}) {
      const scope = captureRequestScope(storage);
      const cacheKey = `${requestScopeKey(scope)}:${key}`;
      const existing = entries.get(cacheKey);
      if (existing?.flight) return existing.flight;
      if (!force && existing?.expiresAt > now()) return Promise.resolve().then(() => {
        assertRequestScope(storage, scope);
        return existing.value;
      });
      const generation = revision;
      const entry = {};
      entries.delete(cacheKey);
      while (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
      entries.set(cacheKey, entry);
      entry.flight = Promise.resolve().then(load).then(value => {
        assertRequestScope(storage, scope);
        if (ttlMs > 0 && generation === revision && entries.get(cacheKey) === entry) {
          const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
          if (bytes <= maxBytes) { entry.value = value; entry.expiresAt = now() + ttlMs; }
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
