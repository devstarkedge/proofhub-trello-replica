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
    const method = (error.config?.method || '').toLowerCase();
    const isMutation = ['post', 'put', 'patch', 'delete'].includes(method);

    // Only queue state-modifying requests; let read queries reject so UI handles error states
    if (!navigator.onLine && error.config && !error.config.skipOfflineQueue && isMutation) {
      try {
        await addMutation({
          url: error.config.url,
          method: error.config.method,
          headers: error.config.headers,
          body: error.config.data,
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

export default api;
