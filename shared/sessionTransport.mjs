/** Scoped clients share the authentication client's single refresh operation. */
import { actorFromToken } from './offlineQueue.mjs';
export function sessionIdentity(storage) {
  const token = storage.getItem('token') || '';
  let version;
  try { version = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).tokenVersion; } catch { /* Invalid tokens cannot cross identities. */ }
  return { actor: actorFromToken(token), version, workspaceId: storage.getItem('workspaceId'), token };
}
export function isCurrentSession(identity, storage) {
  const current = sessionIdentity(storage);
  return identity && identity.workspaceId === current.workspaceId && identity.version === current.version &&
    (identity.actor ? identity.actor === current.actor : identity.token === current.token);
}
const identityChanged = () => new DOMException('Account or workspace changed; reopen this item before retrying.', 'AbortError');
const attemptKey = 'flowtask:refresh-attempt:v1';
const lockKey = 'flowtask:refresh-lock:v1';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const readJson = (storage, key) => { try { return JSON.parse(storage.getItem(key)); } catch { return null; } };
const randomId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto?.getRandomValues(new Uint8Array(24));
  if (!bytes) throw new Error('Secure session refresh is unavailable; retry in a supported browser.');
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};
export function getRefreshRequestId(storage) {
  const attempt = readJson(storage, attemptKey);
  return attempt?.credential === storage.getItem('refreshToken') ? attempt.id : undefined;
}
// Web Locks serializes all tabs/windows of this origin. The expiring lease is
// for older engines only; the shared attempt receipt also makes retries safe.
async function withRefreshLock(storage, locks, operation) {
  if (locks?.request) return locks.request('flowtask-session-refresh', operation);
  const owner = randomId(), deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const existing = readJson(storage, lockKey);
    if (existing?.until > Date.now() && existing.owner !== owner) { await delay(50); continue; }
    storage.setItem(lockKey, JSON.stringify({ owner, until: Date.now() + 20000 }));
    await delay(30);
    if (readJson(storage, lockKey)?.owner !== owner) continue;
    const renew = setInterval(() => {
      if (readJson(storage, lockKey)?.owner === owner) storage.setItem(lockKey, JSON.stringify({ owner, until: Date.now() + 20000 }));
    }, 5000);
    try { return await operation(); } finally {
      clearInterval(renew);
      if (readJson(storage, lockKey)?.owner === owner) storage.removeItem(lockKey);
    }
  }
  throw new Error('Session refresh is still in progress. Please retry.');
}

export function installSessionTransport(api, storage, notify = () => {}, { refreshClient = api, locks = globalThis.navigator?.locks } = {}) {
  let refreshing;
  api.interceptors.request.use(config => {
    if (config._sessionIdentity && !isCurrentSession(config._sessionIdentity, storage)) throw identityChanged();
    config._sessionIdentity ||= sessionIdentity(storage);
    return config;
  }, error => { throw error; }, { synchronous: true });
  const remember = response => {
    const data = response?.data;
    if (typeof data?.token === 'string' && typeof data?.refreshToken === 'string') {
      if (response.config?._refreshCredential && storage.getItem('refreshToken') !== response.config._refreshCredential) throw new Error('Session changed while refreshing');
      if (!response.config?._refreshCredential && response.config?._sessionIdentity && !isCurrentSession(response.config._sessionIdentity, storage)) throw identityChanged();
      storage.setItem('token', data.token);
      storage.setItem('refreshToken', data.refreshToken);
      storage.removeItem(attemptKey);
      notify(data.token);
    }
    return response;
  };
  api.refreshAccessToken = () => {
    if (refreshClient !== api) return refreshClient.refreshAccessToken();
    if (!refreshing) {
      const refreshToken = storage.getItem('refreshToken');
      if (!refreshToken) return Promise.reject(new Error('Sign in to continue'));
      const identity = sessionIdentity(storage);
      refreshing = withRefreshLock(storage, locks, async () => {
        const current = sessionIdentity(storage);
        if (current.actor !== identity.actor || current.version !== identity.version || !storage.getItem('refreshToken')) throw identityChanged();
        // Another context completed the rotation while this one waited.
        if (storage.getItem('refreshToken') !== refreshToken) { notify(current.token); return current.token; }
        let attempt = readJson(storage, attemptKey);
        if (attempt?.credential !== refreshToken || !attempt.id) {
          attempt = { credential: refreshToken, id: randomId(), createdAt: Date.now() };
          storage.setItem(attemptKey, JSON.stringify(attempt));
        }
        for (let count = 0; ; count++) {
          try {
            const response = await api.post('/api/auth/refresh', { refreshToken, requestId: attempt.id }, { skipOfflineQueue: true, _refreshCredential: refreshToken, timeout: 15000 });
            return response.data.token;
          } catch (error) {
            if (storage.getItem('refreshToken') !== refreshToken) {
              const latest = sessionIdentity(storage);
              if (latest.actor === identity.actor && latest.version === identity.version && latest.token) { notify(latest.token); return latest.token; }
              throw identityChanged();
            }
            const status = error.response?.status;
            // A lost response may have committed rotation. Retry the SAME id,
            // never a second independent rotation, and preserve it for recovery.
            if (count === 0 && (!status || status >= 500) && globalThis.navigator?.onLine !== false && error.name !== 'AbortError') { await delay(300); continue; }
            if (status === 401) notify(null);
            throw error;
          }
        }
      })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  };
  api.interceptors.response.use(remember, async error => {
    const request = error.config;
    if (!request || request._sessionRetry || error.response?.status !== 401 || /\/api\/auth\/(?!verify|me)/.test(request.url || '')) throw error;
    const refreshToken = storage.getItem('refreshToken');
    if (!refreshToken) throw error;
    const original = String(request.headers?.Authorization || request.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    const current = storage.getItem('token');
    if (!original || !actorFromToken(original) || actorFromToken(original) !== actorFromToken(current || '')) throw error;
    if (!isCurrentSession(request._sessionIdentity, storage)) throw identityChanged();
    request._sessionRetry = true;
    request._sessionActor = actorFromToken(original);
    try {
      // A delayed 401 may arrive after another client already rotated the token.
      const token = original !== current ? current : await api.refreshAccessToken();
      if (!isCurrentSession(request._sessionIdentity, storage)) throw identityChanged();
      request.headers ||= {};
      request.headers.Authorization = `Bearer ${token}`;
      return api(request);
    } catch (refreshError) {
      throw refreshError;
    }
  });
}

export function installScopedSessionTransport(api, sessionClient, storage) {
  installSessionTransport(api, storage, () => {}, { refreshClient: sessionClient });
  api.interceptors.response.use(response => {
    if (!isCurrentSession(response.config._sessionIdentity, storage)) throw identityChanged();
    return response;
  });
}

export function createSessionFetch(api, storage, nativeFetch = globalThis.fetch) {
  return async function sessionFetch(input, options = {}) {
    const identity = sessionIdentity(storage);
    const response = await nativeFetch(input, options);
    if (!isCurrentSession(identity, storage)) throw identityChanged();
    const url = String(input?.url || input);
    if (response.status !== 401 || !url.includes('/api/') || url.includes('/api/auth/')) return response;
    const originalHeaders = new Headers(options.headers || input?.headers || {});
    const originalToken = originalHeaders.get('Authorization')?.replace(/^Bearer\s+/i, '');
    const currentToken = storage.getItem('token');
    if (!originalToken || !currentToken || !actorFromToken(originalToken) || actorFromToken(originalToken) !== actorFromToken(currentToken) || !storage.getItem('refreshToken')) return response;
    const token = originalToken === currentToken ? await api.refreshAccessToken() : currentToken;
    if (actorFromToken(token) !== actorFromToken(storage.getItem('token') || '')) return response;
    originalHeaders.set('Authorization', `Bearer ${token}`);
    const retried = await nativeFetch(input, { ...options, headers: originalHeaders });
    if (!isCurrentSession(identity, storage)) throw identityChanged();
    return retried;
  };
}
