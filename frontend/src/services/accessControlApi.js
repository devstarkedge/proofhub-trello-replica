import api from './api';

/**
 * Client for the centralized Access & Permissions engine
 * (backend: routes/accessControl.js -> modules/permissions/).
 *
 * This is the ONE place the frontend talks to the permission engine —
 * ModuleAccessPanel, FinanceAccessControl, and any future module's access
 * panel all go through these same three calls instead of each owning a
 * bespoke endpoint.
 */

export const getRegistry = async () => {
  const { data } = await api.get('/api/access-control/registry');
  return data?.data;
};

export const getMyEffectivePermissions = async () => {
  const { data } = await api.get('/api/access-control/my-permissions');
  return data?.data;
};

export const getUserEffectivePermissions = async (userId) => {
  const { data } = await api.get(`/api/access-control/users/${userId}/effective`);
  return data?.data;
};

export const putUserResourceOverride = async (userId, resource, payload) => {
  const { data } = await api.put(`/api/access-control/users/${userId}/overrides/${resource}`, payload);
  return data?.data;
};

export const deleteUserResourceOverride = async (userId, resource) => {
  const { data } = await api.delete(`/api/access-control/users/${userId}/overrides/${resource}`);
  return data?.data;
};

/**
 * Cursor-paginated audit log fetch.
 *
 * @param {object} opts
 * @param {string}  [opts.cursor]       Last-seen entry _id (omit for first page)
 * @param {number}  [opts.limit=50]     Records per page (100 for initial load)
 * @param {string}  [opts.sort]         'newest' | 'oldest'
 * @param {string}  [opts.startDate]    ISO date string
 * @param {string}  [opts.endDate]      ISO date string
 * @param {string}  [opts.targetId]     ObjectId string — filter by affected user
 * @param {string}  [opts.actorId]      ObjectId string — filter by performer
 * @param {string}  [opts.resourceKey]  e.g. 'sales', 'finance'
 * @param {string}  [opts.action]       e.g. 'PERMISSION_GRANTED'
 * @param {string}  [opts.search]       Free-text search
 * @returns {{ data: object[], nextCursor: string|null, hasMore: boolean }}
 */
export const fetchAuditLogPage = async (opts = {}) => {
  const params = {};
  if (opts.cursor)      params.cursor      = opts.cursor;
  if (opts.limit)       params.limit       = opts.limit;
  if (opts.sort)        params.sort        = opts.sort;
  if (opts.startDate)   params.startDate   = opts.startDate;
  if (opts.endDate)     params.endDate     = opts.endDate;
  if (opts.targetId)    params.targetId    = opts.targetId;
  if (opts.actorId)     params.actorId     = opts.actorId;
  if (opts.resourceKey) params.resourceKey = opts.resourceKey;
  if (opts.action)      params.action      = opts.action;
  if (opts.search)      params.search      = opts.search;

  const { data } = await api.get('/api/access-control/audit-log', { params });
  return {
    data:       data?.data       ?? [],
    nextCursor: data?.nextCursor ?? null,
    hasMore:    data?.hasMore    ?? false
  };
};

/**
 * Lazy-loads full change details for one log entry.
 * Called only when the user expands a row — never as part of the list fetch.
 */
export const fetchAuditLogEntryDetail = async (id) => {
  const { data } = await api.get(`/api/access-control/audit-log/${id}`);
  return data?.data ?? null;
};

// Legacy shim — kept so any callers not yet migrated keep compiling.
export const getAuditLog = async ({ targetId, limit } = {}) => {
  const { data: page } = await fetchAuditLogPage({ targetId, limit });
  return page;
};
