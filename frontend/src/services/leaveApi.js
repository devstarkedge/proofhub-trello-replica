import axios from 'axios';
import { toast } from 'react-toastify';

const baseURL = import.meta.env.VITE_BACKEND_URL;

const api = axios.create({
  baseURL: `${baseURL}/api/leave`,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use((config) => {
  if (['get', 'head'].includes(config.method) && !config.timeout) config.timeout = 20000;
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const workspaceId = localStorage.getItem('workspaceId');
  if (workspaceId && !config.headers['x-workspace-id']) config.headers['x-workspace-id'] = workspaceId;
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (!['get', 'head', 'options'].includes(response.config.method)) window.dispatchEvent(new CustomEvent('leave-local-change', { detail: { workspaceId: response.config.headers['x-workspace-id'] } }));
    return response;
  },
  (error) => {
    const message = error.response?.data?.message || 'An error occurred';
    if (!error.config?.silentError && !axios.isCancel(error) && ![403, 423].includes(error.response?.status)) toast.error(message);
    return Promise.reject(error);
  }
);

// ─── Setup ──────────────────────────────────────────────────────────────────
export const setupLeaveModule = async () => (await api.post('/setup')).data;
export const getSetupStatus = async () => (await api.get('/setup')).data;

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
export const deleteArchivedPolicy = async (policyId, kind = 'default') => (await api.delete(`/policies/${kind}/${policyId}`)).data;
const readOptions = ({ signal, workspaceId, silentError } = {}) => ({ signal, silentError, ...(workspaceId ? { headers: { 'x-workspace-id': workspaceId } } : {}) });
export const getPendingCount = async (_params, options) => (await api.get('/dashboard/pending-count', readOptions(options))).data;
export const getCalendarEvents = async (params, options) => (await api.get('/calendar/events', { params, ...readOptions(options) })).data;
export const getDashboardRecords = async (params, options) => (await api.get('/dashboard/records', { params, ...readOptions(options) })).data;
export const getDashboardSummary = async (params = {}, options) => (await api.get('/dashboard/summary', { params, ...readOptions(options) })).data;

// ─── Override (department/role/employee-specific) Policies ─────────────────
export const getOverridePolicies = async () => (await api.get('/policies/overrides')).data;
export const createOverridePolicy = async (payload) => (await api.post('/policies/overrides', payload)).data;
export const editOverridePolicy = async (policyId, payload) => (await api.patch(`/policies/overrides/${policyId}`, payload)).data;
export const archiveOverridePolicy = async (policyId) => (await api.post(`/policies/overrides/${policyId}/archive`)).data;
export const removeOverrideAssignment = async (assignmentId) => (await api.post(`/policies/overrides/assignments/${assignmentId}/remove`)).data;

// ─── Working Calendar ───────────────────────────────────────────────────────
export const getWorkCalendars = async () => (await api.get('/work-calendars')).data;
export const upsertWorkCalendar = async (payload) => (await api.post('/work-calendars', payload)).data;
export const getHolidays = async (params = {}, options) => (await api.get('/holidays', { params, ...readOptions(options) })).data;
export const createHoliday = async (payload) => (await api.post('/holidays', payload)).data;
export const deleteHoliday = async (holidayId) => (await api.delete(`/holidays/${holidayId}`)).data;

// ─── Work Calendar Engine (base pattern + recurring rules + date overrides) ─
export const getWorkCalendarConfig = async () => (await api.get('/work-calendar/config')).data;
export const saveWorkCalendarConfig = async (payload) => (await api.post('/work-calendar/config', payload)).data;
export const previewWorkCalendarConfig = async (payload) => (await api.post('/work-calendar/preview', payload)).data;

// ─── Balance ────────────────────────────────────────────────────────────────
export const getMyBalance = async (_params, options) => (await api.get('/balance/me', readOptions(options))).data;
export const getMyLeaveActivity = async (params = {}, options) => (await api.get('/balance/activity', { params, ...readOptions(options) })).data;
export const getMyLeaveActivityDetail = async (activityId, options) => (await api.get(`/balance/activity/${activityId}`, readOptions(options))).data;
export const getUserBalance = async (userId) => (await api.get(`/balance/${userId}`)).data;

// ─── Requests ───────────────────────────────────────────────────────────────
export const getMyRequests = async (params = {}) => (await api.get('/requests/mine', { params })).data;
export const getUserRequests = async (userId, params = {}) => (await api.get(`/requests/user/${userId}`, { params })).data;
export const getRequestDetail = async (requestId, options) => (await api.get(`/requests/${requestId}`, readOptions(options))).data;
export const submitRequest = async (payload, options) => (await api.post('/requests', payload, { ...readOptions(options), silentError: true })).data;
export const cancelPendingRequest = async (requestId, options) => (await api.post(`/requests/${requestId}/cancel`, undefined, readOptions(options))).data;
export const requestCancellation = async (requestId, reason, options) =>
  (await api.post(`/requests/${requestId}/request-cancellation`, { reason }, readOptions(options))).data;

// ─── Approvals ──────────────────────────────────────────────────────────────
export const getApprovalQueue = async () => (await api.get('/approvals/queue')).data;
export const decideApproval = async (approvalId, decision, comment, options) =>
  (await api.post(`/approvals/${approvalId}/decide`, { decision, comment }, readOptions(options))).data;
export const getApprovalTimeline = async (requestId) => (await api.get(`/approvals/requests/${requestId}/timeline`)).data;
export const decideCancellationRequest = async (requestId, decision, reason, options) =>
  (await api.post(`/approvals/requests/${requestId}/cancellation-decision`, { decision, reason }, readOptions(options))).data;
export const hrCancelApprovedLeave = async (requestId, reason, options) =>
  (await api.post(`/approvals/requests/${requestId}/hr-cancel`, { reason }, readOptions(options))).data;

// ─── Adjustments ────────────────────────────────────────────────────────────
export const createAdjustment = async (payload) => (await api.post('/adjustments', payload)).data;
export const getAdjustments = async (params = {}) => (await api.get('/adjustments', { params })).data;

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
export const getDayStatus = async ({ userIds, startDate, endDate, visibility, calendarOnly }, options) =>
  (await api.get('/dashboard/day-status', { params: { userIds: userIds.join(','), startDate, endDate, visibility, calendarOnly }, ...readOptions(options) })).data;

// ─── Reports & Audit ────────────────────────────────────────────────────────
export const getEmployeeUsageReport = async (userId) => (await api.get(`/reports/usage/employee/${userId || ''}`)).data;
export const getDepartmentUsageReport = async (params) => (await api.get('/reports/usage/department', { params })).data;
export const getMonthlyTrends = async (params) => (await api.get('/reports/trends', { params })).data;
export const getApprovalTurnaround = async (params) => (await api.get('/reports/approval-turnaround', { params })).data;
export const getAuditLog = async (params = {}) => (await api.get('/reports/audit-log', { params })).data;

export default api;
