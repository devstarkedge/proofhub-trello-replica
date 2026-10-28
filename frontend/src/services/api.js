import { actorFromToken } from '../../../shared/offlineQueue.mjs';
import { shouldQueueOfflineRequest } from './requestPolicy';
import { installSessionTransport } from '../../../shared/sessionTransport.mjs';
import axios from 'axios';
import { addMutation, processMutations } from './backgroundSync';

const api = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to check network status and include token
api.interceptors.request.use(
  (config) => {
    config._requestActor ||= actorFromToken(localStorage.getItem('token') || '');
    config._requestWorkspace ||= config.headers?.['x-workspace-id'] || localStorage.getItem('workspaceId');
    if (config._sessionActor && actorFromToken(localStorage.getItem('token') || '') !== config._sessionActor) {
      config.skipOfflineQueue = true;
      throw new Error('Session changed; reopen this item before retrying');
    }
    // Block requests when offline
    if (!navigator.onLine) {
      const offlineError = new Error('No internet connection. Please check your network.');
      offlineError.code = 'NETWORK_OFFLINE';
      offlineError.config = config;
      return Promise.reject(offlineError);
    }
    
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    const workspaceId = localStorage.getItem('workspaceId');
    if (workspaceId && !config.headers['x-workspace-id']) {
      config.headers['x-workspace-id'] = workspaceId;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor for offline handling
api.interceptors.response.use(
  (response) => response,
  async (error) => {

    // Only queue state-modifying requests; let read queries reject so UI handles error states
    if (!navigator.onLine && shouldQueueOfflineRequest(error.config)) {
      try {
        await addMutation({
          url: api.getUri(error.config),
          baseURL: error.config.baseURL,
          method: error.config.method,
          body: error.config.data,
          actorId: error.config._requestActor, workspaceId: error.config._requestWorkspace,
          timestamp: Date.now(),
        });
        return Promise.resolve({ data: { offline: true, queued: true, success: true } });
      } catch (queueErr) {
        console.error('Failed to queue offline mutation:', queueErr);
      }
    }
    return Promise.reject(error);
  }
);

// Process mutations when coming back online
window.addEventListener('online', () => {
  processMutations();
});

installSessionTransport(api, localStorage, token => window.dispatchEvent(new CustomEvent('session-token-updated', { detail: { token } })));

export default api;
