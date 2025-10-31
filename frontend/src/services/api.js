import axios from 'axios';
import { addMutation, processMutations } from './backgroundSync';

const api = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to include the token in all requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
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
    if (!navigator.onLine && error.config) {
      // Store the failed request for later retry
      await addMutation({
        url: error.config.url,
        method: error.config.method,
        headers: error.config.headers,
        body: error.config.data,
        timestamp: Date.now(),
      });
      // Return a resolved promise to prevent the error from propagating
      return Promise.resolve({ data: { offline: true } });
    }
    return Promise.reject(error);
  }
);

// Process mutations when coming back online
window.addEventListener('online', () => {
  processMutations();
});

export default api;
