import axios from 'axios';
import { toast } from 'react-toastify';

const baseURL = import.meta.env.VITE_BACKEND_URL;

const api = axios.create({
  baseURL: `${baseURL}/api/attendance`,
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
export const setupAttendanceModule = async () => (await api.post('/setup')).data;

// ─── Self-service (check-in/out) ───────────────────────────────────────────
export const getMyTodayStatus = async () => (await api.get('/me/today')).data;
export const checkIn = async (payload) => (await api.post('/check-in', payload)).data;
export const checkOut = async (payload) => (await api.post('/check-out', payload)).data;

// ─── Policy ─────────────────────────────────────────────────────────────────
export const getPolicyConfig = async () => (await api.get('/policy')).data;
export const createPolicy = async (payload) => (await api.post('/policy', payload)).data;
export const editPolicy = async (policyId, payload) => (await api.patch(`/policy/${policyId}`, payload)).data;
export const activatePolicy = async (policyId) => (await api.post(`/policy/${policyId}/activate`)).data;
export const archivePolicy = async (policyId) => (await api.post(`/policy/${policyId}/archive`)).data;

// ─── Shifts ─────────────────────────────────────────────────────────────────
export const getShifts = async (params = {}) => (await api.get('/shifts', { params })).data;
export const createShift = async (payload) => (await api.post('/shifts', payload)).data;
export const updateShift = async (shiftId, payload) => (await api.patch(`/shifts/${shiftId}`, payload)).data;
export const deactivateShift = async (shiftId) => (await api.post(`/shifts/${shiftId}/deactivate`)).data;

export const getShiftAssignments = async () => (await api.get('/shift-assignments')).data;
export const createShiftAssignment = async (payload) => (await api.post('/shift-assignments', payload)).data;
export const removeShiftAssignment = async (assignmentId) => (await api.post(`/shift-assignments/${assignmentId}/remove`)).data;

// ─── Locations ──────────────────────────────────────────────────────────────
export const getLocations = async (params = {}) => (await api.get('/locations', { params })).data;
export const createLocation = async (payload) => (await api.post('/locations', payload)).data;
export const updateLocation = async (locationId, payload) => (await api.patch(`/locations/${locationId}`, payload)).data;
export const deactivateLocation = async (locationId) => (await api.post(`/locations/${locationId}/deactivate`)).data;
export const activateLocation = async (locationId) => (await api.post(`/locations/${locationId}/activate`)).data;
export const deleteLocation = async (locationId) => (await api.post(`/locations/${locationId}/delete`)).data;
// No location-assignment endpoints — an active location is available to
// every attendance-eligible workspace member automatically (see backend
// attendanceGeofence.service.js#resolveEligibleLocations).

// ─── Work Mode Overrides ────────────────────────────────────────────────────
export const getWorkModeOverrides = async () => (await api.get('/work-mode-overrides')).data;
export const getWorkModeOverrideHistory = async (scopeType, scopeId) => (await api.get('/work-mode-overrides/history', { params: { scopeType, scopeId } })).data;
export const createWorkModeOverride = async (payload) => (await api.post('/work-mode-overrides', payload)).data;
export const updateWorkModeOverride = async (overrideId, payload) => (await api.patch(`/work-mode-overrides/${overrideId}`, payload)).data;
export const deactivateWorkModeOverride = async (overrideId) => (await api.post(`/work-mode-overrides/${overrideId}/deactivate`)).data;

export const getWorkModeScheduleRules = async (overrideId) => (await api.get(`/work-mode-overrides/${overrideId}/rules`)).data;
export const createWorkModeScheduleRule = async (overrideId, payload) => (await api.post(`/work-mode-overrides/${overrideId}/rules`, payload)).data;
export const deactivateWorkModeScheduleRule = async (ruleId) => (await api.post(`/work-mode-overrides/rules/${ruleId}/deactivate`)).data;

export const getWorkModeDateOverrides = async (overrideId) => (await api.get(`/work-mode-overrides/${overrideId}/date-overrides`)).data;
export const createWorkModeDateOverrides = async (overrideId, payload) => (await api.post(`/work-mode-overrides/${overrideId}/date-overrides`, payload)).data;
export const deactivateWorkModeDateOverride = async (dateOverrideId) => (await api.post(`/work-mode-overrides/date-overrides/${dateOverrideId}/deactivate`)).data;

// ─── Office Hours Overrides ─────────────────────────────────────────────────
export const getOfficeHoursOverrides = async () => (await api.get('/office-hours-overrides')).data;
export const getOfficeHoursOverrideHistory = async (scopeType, scopeId) => (await api.get('/office-hours-overrides/history', { params: { scopeType, scopeId } })).data;
export const createOfficeHoursOverride = async (payload) => (await api.post('/office-hours-overrides', payload)).data;
export const updateOfficeHoursOverride = async (overrideId, payload) => (await api.patch(`/office-hours-overrides/${overrideId}`, payload)).data;
export const deactivateOfficeHoursOverride = async (overrideId) => (await api.post(`/office-hours-overrides/${overrideId}/deactivate`)).data;

// ─── WFH requests ───────────────────────────────────────────────────────────
export const getMyWfhRequests = async () => (await api.get('/wfh/mine')).data;
export const submitWfhRequest = async (payload) => (await api.post('/wfh', payload)).data;
export const cancelWfhRequest = async (requestId) => (await api.post(`/wfh/${requestId}/cancel`)).data;
export const getWfhTimeline = async (requestId) => (await api.get(`/wfh/${requestId}/timeline`)).data;
export const getWfhApprovalQueue = async () => (await api.get('/wfh/approvals/queue')).data;
export const decideWfhApproval = async (approvalId, decision, comment) =>
  (await api.post(`/wfh/approvals/${approvalId}/decide`, { decision, comment })).data;

// ─── Regularization ─────────────────────────────────────────────────────────
export const getMyRegularizations = async () => (await api.get('/regularizations/mine')).data;
export const submitRegularization = async (payload) => (await api.post('/regularizations', payload)).data;
export const cancelRegularization = async (requestId) => (await api.post(`/regularizations/${requestId}/cancel`)).data;
export const getRegularizationTimeline = async (requestId) => (await api.get(`/regularizations/${requestId}/timeline`)).data;
export const getRegularizationApprovalQueue = async () => (await api.get('/regularizations/approvals/queue')).data;
export const decideRegularizationApproval = async (approvalId, decision, comment) =>
  (await api.post(`/regularizations/approvals/${approvalId}/decide`, { decision, comment })).data;
export const submitManualCorrection = async (payload) => (await api.post('/manual-correction', payload)).data;

// ─── Role-based visibility (view/dashboard) ────────────────────────────────
export const getAttendanceAccess = async () => (await api.get('/access')).data;
export const getAttendanceView = async (params = {}) => (await api.get('/view', { params })).data;
export const getAttendanceDashboard = async (params = {}) => (await api.get('/dashboard', { params })).data;
export const getAttendanceSessionDetail = async (sessionId) => (await api.get(`/sessions/${sessionId}`)).data;

export default api;
