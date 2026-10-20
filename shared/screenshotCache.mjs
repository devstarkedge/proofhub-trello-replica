// The application's QueryClient owns the only image cache. This adapter owns
// resource lifetime, not a second copy of the cached data.
export const SCREENSHOT_CACHE_TIME = 5 * 60 * 1000;
export const screenshotVersion = record => record?.imageVersion || 'immutable-v1';
export const screenshotImageKey = (scope, record) => [
  'tracking-private', scope, 'image', String(record?.user?._id || record?.user || ''),
  String(record?._id || ''), screenshotVersion(record)
];
const isImage = query => query.queryKey[0] === 'tracking-private' && query.queryKey[2] === 'image';
const abortError = () => new DOMException('Screenshot access changed', 'AbortError');

export function createScreenshotCache(client, {
  loadBlob, decode = async (url, signal) => {
    const image = new Image();
    const cancel = () => image.removeAttribute('src');
    signal.addEventListener('abort', cancel, { once: true });
    try { image.src = url; await image.decode(); return image; }
    finally { signal.removeEventListener('abort', cancel); }
  },
  createUrl = blob => URL.createObjectURL(blob),
  revokeUrl = url => URL.revokeObjectURL(url),
  maxBytes = 96 * 1024 * 1024, maxEntries = 160, concurrency = 4,
  cacheTime = SCREENSHOT_CACHE_TIME
}) {
  let generation = 0, active = 0, trimming = false;
  const pending = new Map(), waiting = [];
  const cache = client.getQueryCache();
  const release = value => {
    if (!value?.url) return;
    revokeUrl(value.url);
    value.image?.removeAttribute?.('src');
  };
  const trim = () => {
    if (trimming) return;
    trimming = true;
    try {
      const queries = cache.findAll({ predicate: isImage });
      let bytes = queries.reduce((sum, q) => sum + (q.state.data?.memoryBytes || 0), 0);
      let count = queries.length;
      // Visible images are pinned. The budget bounds retained, inactive images;
      // revoking a visible image would break its current consumer.
      const inactive = queries.filter(q => !q.isActive() && q.state.fetchStatus !== 'fetching')
        .sort((a, b) => (a.screenshotLastUsed || a.state.dataUpdatedAt) - (b.screenshotLastUsed || b.state.dataUpdatedAt));
      for (const query of inactive) {
        if (bytes <= maxBytes && count <= maxEntries) break;
        bytes -= query.state.data?.memoryBytes || 0;
        count--;
        if (query.getObserversCount()) query.reset();
        cache.remove(query);
      }
    } finally { trimming = false; }
  };
  const unsubscribe = cache.subscribe(event => {
    if (!isImage(event.query)) return;
    if (event.type === 'removed') {
      pending.get(event.query.queryHash)?.abort();
      release(event.query.screenshotResource || event.query.state.data);
      event.query.screenshotResource = undefined;
    }
    if (event.type === 'updated' && event.query.screenshotResource !== event.query.state.data) {
      if (event.query.screenshotResource?.url !== event.query.state.data?.url) release(event.query.screenshotResource);
      event.query.screenshotResource = event.query.state.data;
    }
    if (event.type === 'observerAdded') event.query.screenshotLastUsed = Date.now();
    if (event.type === 'observerRemoved') trim();
    // Query schedules its GC timer after publishing success. Evict afterwards,
    // so an already-removed query cannot leave a fresh GC timer behind.
    if (event.type === 'updated' || event.type === 'observerOptionsUpdated') queueMicrotask(trim);
  });
  const invalidate = (screenshotId, update) => {
    const matches = q => q.queryKey[0] === 'tracking-private' && (
      isImage(q) ? q.queryKey[4] === String(screenshotId) && (
        update?.status !== 'READY' || Boolean(
          update.imageVersion && q.queryKey[5] !== screenshotVersion(update)
        )
      ) : q.queryKey[2] === 'details' && q.queryKey[3] === String(screenshotId)
    );
    for (const query of cache.findAll({ predicate: q => matches(q) && isImage(q) })) {
      pending.get(query.queryHash)?.abort();
      // Notify mounted consumers, but do not fetch obsolete content under an
      // old version key. The refreshed metadata enables the correct key.
      if (query.getObserversCount()) query.reset();
      else cache.remove(query);
    }
    client.resetQueries({ predicate: q => matches(q) && !isImage(q) });
  };
  return {
    options(scope, record) {
      const queryKey = screenshotImageKey(scope, record);
      return {
        queryKey, staleTime: query => query.state.data
          ? Math.max(0, query.state.data.authorizedUntil - query.state.dataUpdatedAt) : 0,
        gcTime: cacheTime, retry: false, structuralSharing: false,
        refetchOnWindowFocus: false,
        // Intentionally do not consume Query's observer AbortSignal: a modal
        // closing (including StrictMode replay) must not cancel a shared load.
        // Removal, logout and access invalidation abort our resource controller.
        queryFn: async () => {
          const query = cache.find({ queryKey, exact: true });
          const controller = new AbortController(), epoch = generation;
          pending.set(query.queryHash, controller);
          let url, acquired = false;
          const releasePending = () => { if (url) { revokeUrl(url); url = undefined; } };
          controller.signal.addEventListener('abort', releasePending, { once: true });
          try {
            if (active >= concurrency) await new Promise(resolve => waiting.push(resolve));
            else active++;
            acquired = true;
            if (controller.signal.aborted || epoch !== generation) throw abortError();
            if (record?.expiresAt && +new Date(record.expiresAt) <= Date.now()) throw new Error('Screenshot expired');
            const previous = query.state.data;
            const response = await loadBlob(record._id, 'canonical', controller.signal, { etag: previous?.etag });
            if (controller.signal.aborted || epoch !== generation) throw abortError();
            // Blob-only adapters remain supported for tests and older clients.
            const result = response instanceof Blob ? { blob: response } : response;
            const authorizedUntil = Math.min(Date.now() + cacheTime,
              Number.isFinite(result.authorizedUntil) ? result.authorizedUntil : Date.now() + cacheTime,
              record?.expiresAt ? +new Date(record.expiresAt) : Infinity);
            if (authorizedUntil <= Date.now()) throw new Error('Screenshot authorization expired');
            if (result.notModified) {
              if (!previous?.url) throw new Error('Screenshot validator has no cached image');
              return { ...previous, authorizedUntil };
            }
            const blob = result.blob;
            if (!blob?.size) throw new Error('Screenshot response is empty');
            url = createUrl(blob);
            const image = await decode(url, controller.signal);
            if (controller.signal.aborted || epoch !== generation) { image?.removeAttribute?.('src'); throw abortError(); }
            return { url, image, decoded: true, authorizedUntil, etag: result.etag,
              memoryBytes: blob.size + (image.naturalWidth || record.width || 0) * (image.naturalHeight || record.height || 0) * 4 };
          } catch (error) {
            releasePending();
            throw error;
          } finally {
            if (pending.get(query.queryHash) === controller) pending.delete(query.queryHash);
            controller.signal.removeEventListener('abort', releasePending);
            if (acquired) { const next = waiting.shift(); if (next) next(); else active--; }
          }
        }
      };
    },
    invalidate,
    clear() {
      generation++;
      for (const controller of pending.values()) controller.abort();
      client.cancelQueries({ queryKey: ['tracking-private'] });
      client.removeQueries({ queryKey: ['tracking-private'] });
    },
    dispose() { this.clear(); unsubscribe(); }
  };
}
