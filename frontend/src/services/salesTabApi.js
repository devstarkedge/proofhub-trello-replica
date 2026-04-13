import axios from 'axios';
import { toast } from 'react-toastify';

const baseURL = import.meta.env.VITE_BACKEND_URL;

const api = axios.create({
  baseURL: `${baseURL}/api/sales-tabs`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || 'An error occurred';
    if (![403].includes(error.response?.status)) {
      toast.error(message);
    }
    return Promise.reject(error);
  }
);

// ─── API Functions ──────────────────────────────────────────────────────────

export const getSalesTabs = async () => {
  const { data } = await api.get('/');
  return data;
};

export const createSalesTab = async (tabData) => {
  const { data } = await api.post('/', tabData);
  return data;
};

export const updateSalesTab = async (id, updates) => {
  const { data } = await api.patch(`/${id}`, updates);
  return data;
};

export const deleteSalesTab = async (id) => {
  const { data } = await api.delete(`/${id}`);
  return data;
};

export const approveSalesTab = async (id) => {
  const { data } = await api.post(`/${id}/approve`);
  return data;
};

export const ignoreSalesTab = async (id) => {
  const { data } = await api.post(`/${id}/ignore`);
  return data;
};

export const markSalesTabRead = async (id) => {
  const { data } = await api.post(`/${id}/mark-read`);
  return data;
};
