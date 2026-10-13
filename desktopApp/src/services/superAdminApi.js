import api from './api';

/**
 * Client for the platform-level Super Admin Dashboard
 * (backend: routes/superAdmin.js -> modules/superAdmin/).
 *
 * Every call here targets an explicit workspace id passed as an argument —
 * never the ambient x-workspace-id header/WorkspaceContext. The backend's
 * requireSuperAdmin gate doesn't read that header at all, so these calls
 * work correctly regardless of whatever workspace happens to be active in
 * the caller's own session.
 */

export const getOverview = async () => {
  const { data } = await api.get('/api/super-admin/overview');
  return data?.data;
};

/**
 * Cursor-paginated, searchable, filterable workspace list.
 * @param {object} opts
 * @param {string} [opts.cursor]
 * @param {number} [opts.limit=50]
 * @param {string} [opts.search]     Name / slug / owner name / owner email
 * @param {string} [opts.status]     'active' | 'suspended' | 'archived'
 * @param {string} [opts.plan]       Plan slug
 * @param {string} [opts.type]       'company' | 'team'
 * @param {string} [opts.sort]       'newest' | 'oldest'
 * @returns {{ data: object[], nextCursor: string|null, hasMore: boolean }}
 */
export const fetchWorkspacesPage = async (opts = {}) => {
  const params = {};
  if (opts.cursor) params.cursor = opts.cursor;
  if (opts.limit) params.limit = opts.limit;
  if (opts.search) params.search = opts.search;
  if (opts.status) params.status = opts.status;
  if (opts.plan) params.plan = opts.plan;
  if (opts.type) params.type = opts.type;
  if (opts.sort) params.sort = opts.sort;

  const { data } = await api.get('/api/super-admin/workspaces', { params });
  return { data: data?.data ?? [], nextCursor: data?.nextCursor ?? null, hasMore: data?.hasMore ?? false };
};

export const getWorkspaceOverview = async (workspaceId) => {
  const { data } = await api.get(`/api/super-admin/workspaces/${workspaceId}`);
  return data?.data;
};

export const getWorkspaceMembers = async (workspaceId) => {
  const { data } = await api.get(`/api/super-admin/workspaces/${workspaceId}/members`);
  return data?.data;
};

export const getWorkspaceProjects = async (workspaceId) => {
  const { data } = await api.get(`/api/super-admin/workspaces/${workspaceId}/projects`);
  return data?.data;
};

export const getWorkspaceUsage = async (workspaceId) => {
  const { data } = await api.get(`/api/super-admin/workspaces/${workspaceId}/usage`);
  return data?.data;
};

export const getWorkspaceBilling = async (workspaceId) => {
  const { data } = await api.get(`/api/super-admin/workspaces/${workspaceId}/billing`);
  return data?.data;
};

export const updateWorkspaceBilling = async (workspaceId, { planId, billingCycle, status, notes, customMemberLimit }) => {
  const { data } = await api.patch(`/api/super-admin/workspaces/${workspaceId}/billing`, { planId, billingCycle, status, notes, customMemberLimit });
  return data?.data;
};

export const getWorkspaceActivity = async (workspaceId) => {
  const { data } = await api.get(`/api/super-admin/workspaces/${workspaceId}/activity`);
  return { activity: data?.data ?? [], note: data?.meta?.note };
};

/**
 * Suspend / reactivate / archive / restore. `reason` is required by the
 * backend for suspend/archive, optional for reactivate/restore.
 */
export const updateWorkspaceStatus = async (workspaceId, { status, reason }) => {
  const { data } = await api.patch(`/api/super-admin/workspaces/${workspaceId}/status`, { status, reason });
  return data?.data;
};

export const getPlans = async () => {
  const { data } = await api.get('/api/super-admin/plans');
  return data?.data ?? [];
};

/**
 * Cursor-paginated platform audit log.
 */
export const fetchSuperAdminAuditLogPage = async (opts = {}) => {
  const params = {};
  if (opts.cursor) params.cursor = opts.cursor;
  if (opts.limit) params.limit = opts.limit;
  if (opts.sort) params.sort = opts.sort;
  if (opts.startDate) params.startDate = opts.startDate;
  if (opts.endDate) params.endDate = opts.endDate;
  if (opts.workspaceId) params.workspaceId = opts.workspaceId;
  if (opts.actorId) params.actorId = opts.actorId;
  if (opts.action) params.action = opts.action;
  if (opts.search) params.search = opts.search;

  const { data } = await api.get('/api/super-admin/audit-log', { params });
  return { data: data?.data ?? [], nextCursor: data?.nextCursor ?? null, hasMore: data?.hasMore ?? false };
};

export const getSuperAdminAuditLogEntry = async (id) => {
  const { data } = await api.get(`/api/super-admin/audit-log/${id}`);
  return data?.data ?? null;
};
