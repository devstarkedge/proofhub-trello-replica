import { createScopedReadCache } from './scopedReadCache.mjs';
import { captureRequestScope, assertRequestScope, requestScopeKey } from './requestScope.mjs';
import { moduleReadPolicies } from './moduleReadPolicies.mjs';

const stable = value => value instanceof URLSearchParams ? stable(Object.fromEntries(value)) : Array.isArray(value) ? value.map(stable) :
  value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, stable(value[key])])) : value;
const canceled = () => Object.assign(new Error('Read canceled'), { name: 'CanceledError', code: 'ERR_CANCELED' });
const queryValues = value => Array.isArray(value) ? value.map(queryValues) : value instanceof Date ? value.toISOString() :
  value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, item]) => item != null).map(([key, item]) => [key, queryValues(item)])) : String(value);
const searchValues = params => Object.fromEntries([...new Set(params.keys())].map(key => {
  const values = params.getAll(key); return [key, values.length === 1 ? values[0] : values];
}));
const requestPath = (api, url = '') => {
  const base = api.defaults?.baseURL || '';
  return new URL(/^https?:\/\//.test(url) ? url : `${base.replace(/\/$/, '')}/${url.replace(/^\//, '')}`, 'https://flowtask.invalid').pathname;
};
const snapshotResponse = (result, started) => {
  const headers = { ...result.headers };
  const freshness = Object.entries(headers).find(([name]) => name.toLowerCase() === 'x-read-fresh-for')?.[1];
  const remaining = freshness === undefined ? Infinity : Math.max(0, (Number(freshness) || 0) - (Date.now() - started));
  return { data: result.data, status: result.status, statusText: result.statusText, headers,
    // This deadline is computed once on arrival, never renewed on a client hit.
    freshUntil: Number.isFinite(remaining) ? Date.now() + remaining : null };
};

// One owner per module, shared by routes and modals in either client. Session
// transitions clear it through the existing reset registry.
export function createBusinessReadClient({ storage, target, registerResettable }) {
  const domains = Object.fromEntries(Object.entries(moduleReadPolicies).map(([domain, policy]) => [domain,
    Object.fromEntries(policy.resources.map(resource => [resource, { revision: 0,
      cache: createScopedReadCache({ storage, ttlMs: policy.defaultTtlMs, maxEntries: Math.max(4, Math.floor(24 / policy.resources.length)), maxBytes: 512 * 1024 }) }]))]));
  const freshUntil = { attendance: 0, sales: 0, finance: 0 };
  const subscriptions = new Map();
  const clear = (domain, { fresh = false, resources = Object.keys(domains[domain]) } = {}) => {
    for (const resource of resources) { const bucket = domains[domain][resource]; bucket.revision++; bucket.cache.clear(); }
    if (fresh) freshUntil[domain] = Date.now() + 1000;
  };
  const clearAll = () => Object.keys(domains).forEach(domain => clear(domain));
  registerResettable?.(clearAll);
  const invalidateEvent = event => {
    const type = event.detail?.type || event.type || '';
    const workspace = event.detail?.payload?.workspaceId || event.detail?.workspaceId;
    if (workspace && String(workspace) !== storage.getItem('workspaceId')) return;
    if (/authz|access|permission|role|department|socket-connected|online|data-invalidated|workspace-updated|workspace-membership|user-verified|user-assigned|user-unassigned/.test(type)) return clearAll();
    for (const domain of Object.keys(domains)) clear(domain, { resources: moduleReadPolicies[domain].eventResources(type) });
  };
  for (const event of ['flowtask:realtime', 'socket-connected', 'online', 'flowtask:data-invalidated', 'tracking-local-change', 'flowtask:tracking-refresh', 'attendance-regularization-refresh']) target?.addEventListener(event, invalidateEvent);

  async function read(domain, key, load, { resource = moduleReadPolicies[domain].clientResource(`/${key}`), response = false } = {}) {
    const identity = captureRequestScope(storage);
    const bucket = domains[domain][resource];
    for (let attempt = 0; attempt < 2; attempt++) {
      const revision = bucket.revision;
      const value = await bucket.cache.read(key, async () => {
        const started = Date.now();
        const result = await load({ headers: freshUntil[domain] > Date.now() ? { 'Cache-Control': 'no-cache' } : {} });
        return response ? snapshotResponse(result, started) : result;
      }, { expiresAt: response ? value => value.freshUntil ?? Infinity : undefined });
      assertRequestScope(storage, identity);
      if (revision === bucket.revision) return structuredClone(response ? value.data : value);
    }
    throw canceled();
  }
  function install(api, domain, allow, mutates = () => true) {
    const get = api.get.bind(api);
    api.get = async (url, config = {}) => {
      const parsed = new URL(url, 'https://flowtask.invalid');
      const ttlMs = moduleReadPolicies[domain].clientTtl(parsed.pathname);
      if (ttlMs === null || !allow(url, config)) return get(url, config);
      if (config.signal?.aborted) throw canceled();
      if (config.forceRefresh) clear(domain, { fresh: true });
      const resource = moduleReadPolicies[domain].clientResource(requestPath(api, url));
      const bucket = domains[domain][resource];
      const identity = captureRequestScope(storage);
      const params = config.params instanceof URLSearchParams ? searchValues(config.params) : config.params;
      const key = JSON.stringify([`${api.defaults?.baseURL || ''}:${parsed.pathname}`, stable(queryValues({ ...searchValues(parsed.searchParams), ...params })), config.responseType || 'json']);
      const subscriptionKey = `${domain}:${resource}:${requestScopeKey(identity)}:${key}`;
      let subscription = subscriptions.get(subscriptionKey);
      if (!subscription) {
        subscription = { controller: new AbortController(), consumers: 0, active: 0 };
        subscriptions.set(subscriptionKey, subscription);
      }
      subscription.consumers++;
      let onAbort;
      const run = async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          const revision = bucket.revision;
          const response = await bucket.cache.read(key, async () => {
            // A closing modal cancels its subscription, not another consumer's read.
            subscription.active++;
            try {
              const started = Date.now();
              const result = await get(url, { ...config, signal: subscription.controller.signal,
                headers: { ...config.headers, ...(freshUntil[domain] > Date.now() ? { 'Cache-Control': 'no-cache' } : {}) } });
              return snapshotResponse(result, started);
            } finally { subscription.active--; }
          }, { force: config.forceRefresh === true, ttlMs, expiresAt: value => value.freshUntil ?? Infinity });
          assertRequestScope(storage, identity);
          if (revision !== bucket.revision) continue;
          // A consumer may enrich its DTO locally (e.g. attendance tracked time).
          return { ...response, data: structuredClone(response.data), config };
        }
        throw canceled();
      };
      try {
        return await Promise.race([run(), ...(config.signal ? [new Promise((_, reject) => {
          onAbort = () => reject(canceled()); config.signal.addEventListener('abort', onAbort, { once: true });
        })] : [])]);
      } finally {
        if (onAbort) config.signal.removeEventListener('abort', onAbort);
        if (--subscription.consumers === 0) {
          if (subscription.active) { subscription.controller.abort(); bucket.cache.deletePending(key, identity); }
          if (subscriptions.get(subscriptionKey) === subscription) subscriptions.delete(subscriptionKey);
        }
      }
    };
    // Invalidate at submission and completion. Reads started during a write
    // must not become the confirmed cache after that write finishes.
    const invalidateMutation = config => {
      if (mutates(config) && !['get', 'head', 'options'].includes(String(config.method || 'get').toLowerCase())) {
        clear(domain, { resources: moduleReadPolicies[domain].mutationResources(requestPath(api, config.url)) });
      }
    };
    api.interceptors.request.use(config => {
      invalidateMutation(config);
      return config;
    }, undefined, { synchronous: true });
    api.interceptors.response.use(response => {
      invalidateMutation(response.config || {});
      return response;
    }, error => {
      if ([401, 403, 404].includes(error.response?.status)) clear(domain);
      return Promise.reject(error);
    });
    return api;
  }
  return { install, clear, clearAll, read };
}
