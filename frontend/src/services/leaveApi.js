import axios from 'axios';
import { toast } from 'react-toastify';

const baseURL = import.meta.env.VITE_BACKEND_URL;

const api = axios.create({
  baseURL: `${baseURL}/api/leave`,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const workspaceId = localStorage.getItem('workspaceId');
  if (workspaceId) config.headers['x-workspace-id'] = workspaceId;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || 'An error occurred';
    if (![403, 423].includes(error.response?.status)) toast.error(message);
    return Promise.reject(error);
  }
);

// ─── Setup ──────────────────────────────────────────────────────────────────
export const setupLeaveModule = async () => (await api.post('/setup')).data;

// ─── Leave Types & Policies ─────────────────────────────────────────────────
export const getLeaveTypes = async (params = {}) => (await api.get('/types', { params })).data;
export const createLeaveType = async (payload) => (await api.post('/types', payload)).data;

export const getPolicies = async (params = {}) => (await api.get('/policies', { params })).data;
export const createPolicy = async (payload) => (await api.post('/policies', payload)).data;
export const getPolicy = async (policyId) => (await api.get(`/policies/${policyId}`)).data;
export const createPolicyVersion = async (policyId, payload) => (await api.post(`/policies/${policyId}/versions`, payload)).data;
export const publishPolicyVersion = async (policyId, versionId) =>
  (await api.post(`/policies/${policyId}/versions/${versionId}/publish`)).data;
export const assignPolicy = async (policyId, payload) => (await api.post(`/policies/${policyId}/assignments`, payload)).data;
export const getAssignments = async (policyId) => (await api.get('/assignments', { params: { policyId } })).data;

// ─── Default (workspace-wide, single-active) Policy ─────────────────────────
export const getDefaultPolicies = async () => (await api.get('/policies/default')).data;
export const createDefaultPolicy = async (payload) => (await api.post('/policies/default', payload)).data;
export const editDefaultPolicy = async (policyId, payload) => (await api.patch(`/policies/default/${policyId}`, payload)).data;
export const activateDefaultPolicy = async (policyId) => (await api.post(`/policies/default/${policyId}/activate`)).data;
export const archiveDefaultPolicy = async (policyId) => (await api.post(`/policies/default/${policyId}/archive`)).data;

// ─── Override (department/role/employee-specific) Policies ─────────────────
export const getOverridePolicies = async () => (await api.get('/policies/overrides')).data;
export const createOverridePolicy = async (payload) => (await api.post('/policies/overrides', payload)).data;
export const editOverridePolicy = async (policyId, payload) => (await api.patch(`/policies/overrides/${policyId}`, payload)).data;
export const archiveOverridePolicy = async (policyId) => (await api.post(`/policies/overrides/${policyId}/archive`)).data;
export const removeOverrideAssignment = async (assignmentId) => (await api.post(`/policies/overrides/assignments/${assignmentId}/remove`)).data;

// ─── Working Calendar ───────────────────────────────────────────────────────
export const getWorkCalendars = async () => (await api.get('/work-calendars')).data;
export const upsertWorkCalendar = async (payload) => (await api.post('/work-calendars', payload)).data;
export const getHolidays = async (params = {}) => (await api.get('/holidays', { params })).data;
export const createHoliday = async (payload) => (await api.post('/holidays', payload)).data;
export const deleteHoliday = async (holidayId) => (await api.delete(`/holidays/${holidayId}`)).data;

// ─── Balance ────────────────────────────────────────────────────────────────
export const getMyBalance = async () => (await api.get('/balance/me')).data;
export const getUserBalance = async (userId) => (await api.get(`/balance/${userId}`)).data;

// ─── Requests ───────────────────────────────────────────────────────────────
export const getMyRequests = async (params = {}) => (await api.get('/requests/mine', { params })).data;
export const getUserRequests = async (userId, params = {}) => (await api.get(`/requests/user/${userId}`, { params })).data;
export const getRequestDetail = async (requestId) => (await api.get(`/requests/${requestId}`)).data;
export const submitRequest = async (payload) => (await api.post('/requests', payload)).data;
export const cancelPendingRequest = async (requestId) => (await api.post(`/requests/${requestId}/cancel`)).data;
export const requestCancellation = async (requestId, reason) =>
  (await api.post(`/requests/${requestId}/request-cancellation`, { reason })).data;

// ─── Approvals ──────────────────────────────────────────────────────────────
export const getApprovalQueue = async () => (await api.get('/approvals/queue')).data;
export const decideApproval = async (approvalId, decision, comment) =>
  (await api.post(`/approvals/${approvalId}/decide`, { decision, comment })).data;
export const getApprovalTimeline = async (requestId) => (await api.get(`/approvals/requests/${requestId}/timeline`)).data;
export const decideCancellationRequest = async (requestId, decision, reason) =>
  (await api.post(`/approvals/requests/${requestId}/cancellation-decision`, { decision, reason })).data;
export const hrCancelApprovedLeave = async (requestId, reason) =>
  (await api.post(`/approvals/requests/${requestId}/hr-cancel`, { reason })).data;

// ─── Adjustments ────────────────────────────────────────────────────────────
export const createAdjustment = async (payload) => (await api.post('/adjustments', payload)).data;

// ─── Dashboards ─────────────────────────────────────────────────────────────
// The single check the frontend must consult to decide whether to render
// the Leave Dashboard at all, and which section — never branch on the raw
// user.role string, since a custom role's real entitlement can only be
// known server-side (department-manager membership, or an explicit
// leave:view_workspace grant). See leaveAuthorization.service.js#getLeaveDashboardScope.
export const getDashboardScope = async () => (await api.get('/dashboard/scope')).data;
export const getEmployeeDashboard = async () => (await api.get('/dashboard/employee')).data;
export const getManagerDashboard = async () => (await api.get('/dashboard/manager')).data;
export const getHrDashboard = async () => (await api.get('/dashboard/hr')).data;
export const getAdminDashboard = async () => (await api.get('/dashboard/admin')).data;
export const getDayStatus = async ({ userIds, startDate, endDate, visibility }) =>
  (await api.get('/dashboard/day-status', { params: { userIds: userIds.join(','), startDate, endDate, visibility } })).data;

// ─── Reports & Audit ────────────────────────────────────────────────────────
export const getEmployeeUsageReport = async (userId) => (await api.get(`/reports/usage/employee/${userId || ''}`)).data;
export const getDepartmentUsageReport = async (params) => (await api.get('/reports/usage/department', { params })).data;
export const getMonthlyTrends = async (params) => (await api.get('/reports/trends', { params })).data;
export const getApprovalTurnaround = async (params) => (await api.get('/reports/approval-turnaround', { params })).data;
export const getAuditLog = async (params = {}) => (await api.get('/reports/audit-log', { params })).data;

export default api;
