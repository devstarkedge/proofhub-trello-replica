import axios from 'axios';
const api = axios.create({ baseURL: `${import.meta.env.VITE_BACKEND_URL}/api/tracking`, timeout: 20000 });
api.interceptors.request.use(config => {
  config.headers.Authorization = `Bearer ${localStorage.getItem('token') || ''}`;
  config.headers['x-workspace-id'] = localStorage.getItem('workspaceId') || '';
  return config;
},undefined,{synchronous:true});
const data = async request => {const workspaceId=localStorage.getItem('workspaceId'),token=localStorage.getItem('token');const result=(await request).data.data;if(workspaceId!==localStorage.getItem('workspaceId')||token!==localStorage.getItem('token')||result?.workspaceId&&String(result.workspaceId)!==String(workspaceId))throw new DOMException('Tracking identity changed','AbortError');return result;};
export const getTrackingState = () => data(api.get('/me'));
export const getWorkOptions = (projectId,signal,page={}) => data(api.get('/options', { params: { projectId,...page },signal }));
export const getAgendas=()=>data(api.get('/agendas'));
export const createAgenda=title=>data(api.post('/agendas',{title}));
export const getTrackingDashboard=(params,signal)=>data(api.get('/dashboard',{params,signal}));
export const getTrackingImpact=()=>data(api.get('/policy/impact'));
export const createWorkTask = payload => data(api.post('/tasks', payload));
export const changeWork = (action, payload) => data(api.post(`/work/${action}`, payload));
export const getWorkOperation=(operationId,sessionId)=>data(api.get(`/work/operations/${operationId}`,{params:{sessionId}}));
export const getReports = (params,signal) => data(api.get('/reports', { params,signal }));
export const getReportMembers = signal => data(api.get('/report-members',{signal}));
export const getAgentRelease = () => data(api.get('/agent-release'));
export const getScreenshotStorageHealth = () => data(api.get('/storage-health'));
export const getTaskTrackedTime = taskId => data(api.get(`/tasks/${taskId}/totals`));
export const getTimeline = (sessionId, before, filters={},signal) => data(api.get(`/sessions/${sessionId}/timeline`, { params: { ...filters,before },signal }));
// Keep private R2 reads behind the existing authenticated backend proxy.
export const getScreenshotBlob = async (screenshotId, variant, signal) => {
  const workspaceId = localStorage.getItem('workspaceId'), token = localStorage.getItem('token');
  const response = await api.get(`/screenshots/${screenshotId}/${variant === 'thumbnail' ? 'thumbnail' : 'content'}`, { responseType: 'blob', signal });
  if (workspaceId !== localStorage.getItem('workspaceId') || token !== localStorage.getItem('token')) throw new DOMException('Tracking identity changed', 'AbortError');
  return response.data;
};
export const revokeDevice = deviceId => data(api.post(`/devices/${deviceId}/revoke`));
export const saveTrackingPolicy = payload => data(api.put('/policy', payload));
export const errorMessage = error => error.response?.data?.message || error.message || 'Unable to update work tracking';

export const getScreenshotGallery=(params,signal)=>data(api.get('/screenshots',{params,signal}));
export const getScreenshotDetails=(id,signal)=>data(api.get(`/screenshots/${id}/details`,{signal}));

export const getWorkHistory=(id,offset,signal)=>data(api.get(`/sessions/${id}/history`,{params:{offset},signal}));
