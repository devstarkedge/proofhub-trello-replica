/** One refresh operation per client; never discard credentials for a network failure. */
import { actorFromToken } from './offlineQueue.mjs';
export function installSessionTransport(api, storage, notify = () => {}) {
  let refreshing;
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
    if (!refreshing) {
      const refreshToken = storage.getItem('refreshToken');
      if (!refreshToken) return Promise.reject(new Error('Sign in to continue'));
      refreshing = api.post('/api/auth/refresh', { refreshToken }, { skipOfflineQueue: true, _refreshCredential: refreshToken })
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
    request._sessionRetry = true;
    request._sessionActor = actorFromToken(original);
    try {
      const token = await api.refreshAccessToken();
      request.headers ||= {};
      request.headers.Authorization = `Bearer ${token}`;
      return api(request);
    } catch (refreshError) {
      throw refreshError;
    }
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
