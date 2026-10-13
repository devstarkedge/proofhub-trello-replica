import api from './api';

/**
 * Client for the centralized Invite Member system — one endpoint branching
 * on `method` ('direct' | 'self_register'), plus the Approval Dashboard
 * endpoints for reviewing 'self_register' join requests. See
 * backend/controllers/memberInvitationController.js.
 */

export const inviteMemberDirect = async (workspaceId, payload) => {
  const { data } = await api.post(`/api/workspaces/${workspaceId}/invite-member`, {
    method: 'direct',
    ...payload,
  });
  return data?.data;
};

export const inviteMemberSelfRegister = async (workspaceId, payload) => {
  const { data } = await api.post(`/api/workspaces/${workspaceId}/invite-member`, {
    method: 'self_register',
    ...payload,
  });
  return data?.data;
};

// payload: { emails: string[], role?: string, department?: string }. Every
// row is invited (or added, if already a platform user) as the given role
// (default 'employee') and department (default none) — a common set of
// attributes for the whole batch, not per-row selection. Returns one
// { email, outcome, newUser? } entry per row for the results summary.
export const inviteMemberBulkSimple = async (workspaceId, payload) => {
  const { data } = await api.post(`/api/workspaces/${workspaceId}/invite-member`, {
    method: 'bulk_simple',
    ...payload,
  });
  return data?.data || [];
};

export const listJoinRequests = async (workspaceId, status = 'pending') => {
  const { data } = await api.get(`/api/workspaces/${workspaceId}/join-requests`, { params: { status } });
  return data?.data || [];
};

export const approveJoinRequest = async (workspaceId, requestId, overrides = {}) => {
  const { data } = await api.patch(`/api/workspaces/${workspaceId}/join-requests/${requestId}/approve`, overrides);
  return data?.data;
};

export const rejectJoinRequest = async (workspaceId, requestId, reason = '') => {
  const { data } = await api.patch(`/api/workspaces/${workspaceId}/join-requests/${requestId}/reject`, { reason });
  return data?.data;
};

export const fetchMemberActivityLog = async (workspaceId, { cursor, limit, sort } = {}) => {
  const { data } = await api.get(`/api/workspaces/${workspaceId}/member-activity-log`, {
    params: { cursor, limit, sort },
  });
  return data;
};
