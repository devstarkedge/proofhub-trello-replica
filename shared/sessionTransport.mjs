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

export function installSessionTransport(api, storage, notify = () => {}, { refreshClient = api } = {}) {
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
      storage.setItem('token', data.token);
      storage.setItem('refreshToken', data.refreshToken);
      notify(data.token);
    }
    return response;
  };
  api.refreshAccessToken = () => {
    if (refreshClient !== api) return refreshClient.refreshAccessToken();
    if (!refreshing) {
      const refreshToken = storage.getItem('refreshToken');
      if (!refreshToken) return Promise.reject(new Error('Sign in to continue'));
      refreshing = api.post('/api/auth/refresh', { refreshToken }, { skipOfflineQueue: true, _refreshCredential: refreshToken, timeout: 15000 })
        .then(response => response.data.token)
        .catch(error => { if (error.response?.status === 401 && storage.getItem('refreshToken') === refreshToken) notify(null); throw error; })
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
    const response = await nativeFetch(input, options);
    const url = String(input?.url || input);
    if (response.status !== 401 || !url.includes('/api/') || url.includes('/api/auth/')) return response;
    const originalHeaders = new Headers(options.headers || input?.headers || {});
    const originalToken = originalHeaders.get('Authorization')?.replace(/^Bearer\s+/i, '');
    const currentToken = storage.getItem('token');
    if (!originalToken || !currentToken || !actorFromToken(originalToken) || actorFromToken(originalToken) !== actorFromToken(currentToken) || !storage.getItem('refreshToken')) return response;
    const token = originalToken === currentToken ? await api.refreshAccessToken() : currentToken;
    if (actorFromToken(token) !== actorFromToken(storage.getItem('token') || '')) return response;
    originalHeaders.set('Authorization', `Bearer ${token}`);
    return nativeFetch(input, { ...options, headers: originalHeaders });
  };
}
