import api from './api';

// Credentials and re-authentication approvals MUST NEVER enter the shared
// offline mutation queue (which persists requests in IndexedDB).
const options = workspaceId => ({ skipOfflineQueue: true, headers: { 'x-workspace-id': workspaceId } });
export const getWorkspaceConfigs = async (workspaceId, issuePage = 1) => (await api.get('/api/workspace-configs', { ...options(workspaceId), params: { issuePage } })).data.data;
export const verifyHubSpotPassword = async (workspaceId, body) => (await api.post('/api/workspace-configs/hubspot/reauth', body, options(workspaceId))).data.data;
export const validateHubSpotKey = async (workspaceId, serviceKey, version, contactOwnerId) => (await api.post('/api/workspace-configs/hubspot/validate', { serviceKey, version, contactOwnerId }, options(workspaceId))).data.data;
export const saveHubSpotConfig = async (workspaceId, body) => (await api.put('/api/workspace-configs/hubspot', body, options(workspaceId))).data.data;
export const toggleHubSpotSync = async (workspaceId, body) => (await api.patch('/api/workspace-configs/hubspot/enabled', body, options(workspaceId))).data.data;
export const setWorkspaceModule = async (workspaceId, body) => (await api.patch('/api/workspace-configs/modules', body, options(workspaceId))).data.data;
export const getWorkspaceModules = async workspaceId => (await api.get('/api/workspace-modules', options(workspaceId))).data.data;
