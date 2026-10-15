import axios from 'axios';
const api = axios.create({ baseURL: `${import.meta.env.VITE_BACKEND_URL}/api/tracking`, timeout: 20000 });
api.interceptors.request.use(config => {
  config.headers.Authorization = `Bearer ${localStorage.getItem('token') || ''}`;
  config.headers['x-workspace-id'] = localStorage.getItem('workspaceId') || '';
  return config;
});
const data = async request => (await request).data.data;
export const getTrackingState = () => data(api.get('/me'));
export const getWorkOptions = projectId => data(api.get('/options', { params: { projectId } }));
export const getAgendas=()=>data(api.get('/agendas'));
export const createAgenda=title=>data(api.post('/agendas',{title}));
export const getTrackingDashboard=params=>data(api.get('/dashboard',{params}));
export const getTrackingImpact=()=>data(api.get('/policy/impact'));
export const createWorkTask = payload => data(api.post('/tasks', payload));
export const changeWork = (action, payload) => data(api.post(`/work/${action}`, payload));
export const getReports = params => data(api.get('/reports', { params }));
export const getReportMembers = () => data(api.get('/report-members'));
export const getAgentRelease = () => data(api.get('/agent-release'));
export const getScreenshotStorageHealth = () => data(api.get('/storage-health'));
export const getTaskTrackedTime = taskId => data(api.get(`/tasks/${taskId}/totals`));
export const getTimeline = (sessionId, before, filters={}) => data(api.get(`/sessions/${sessionId}/timeline`, { params: { ...filters,before } }));
export const getScreenshotUrl = async screenshotId => {
  const response=await api.get(`/screenshots/${screenshotId}/content`,{responseType:'blob'});
  return {url:URL.createObjectURL(response.data)};
};
export const revokeDevice = deviceId => data(api.post(`/devices/${deviceId}/revoke`));
export const saveTrackingPolicy = payload => data(api.put('/policy', payload));
export const errorMessage = error => error.response?.data?.message || error.message || 'Unable to update work tracking';
