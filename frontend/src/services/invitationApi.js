import api from './api';

/**
 * Client for the public token-based workspace invitation flow — see
 * backend/routes/invitations.js. getInvitation is callable while logged
 * out (no auth header required by the backend, though api.js will still
 * attach one if a stale token happens to be in localStorage — harmless,
 * the backend route ignores it).
 */

export const getInvitation = async (token) => {
  const { data } = await api.get(`/api/invitations/${token}`);
  return data?.data;
};

export const acceptInvitation = async (token) => {
  const { data } = await api.post(`/api/invitations/${token}/accept`);
  return data?.data;
};
