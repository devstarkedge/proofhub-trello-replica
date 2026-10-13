import api from './api';

const workspacePlanService = {
  async getPlan(workspaceId) {
    const response = await api.get(`/api/workspaces/${workspaceId}/plan`);
    return response.data;
  },

  async upgradeToPro(workspaceId) {
    const response = await api.post(`/api/workspaces/${workspaceId}/plan/upgrade-to-pro`);
    return response.data;
  },

  async downgradeToFree(workspaceId) {
    const response = await api.post(`/api/workspaces/${workspaceId}/plan/downgrade-to-free`);
    return response.data;
  },
};

export default workspacePlanService;
