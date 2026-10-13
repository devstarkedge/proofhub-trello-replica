import api from './api';

const chatIntegrationService = {
  async getStatus() {
    const response = await api.get('/api/chat-integration/status');
    return response.data;
  },

  async connect(chatAppUrl) {
    const response = await api.post('/api/chat-integration/connect', { chatAppUrl });
    return response.data;
  },

  async disconnect() {
    const response = await api.post('/api/chat-integration/disconnect');
    return response.data;
  },

  async testConnection() {
    const response = await api.post('/api/chat-integration/test');
    return response.data;
  },

  async triggerSync() {
    const response = await api.post('/api/chat-integration/sync');
    return response.data;
  },

  async getChatRedirectUrl() {
    const response = await api.get('/api/chat-integration/redirect');
    return response.data;
  },
};

export default chatIntegrationService;
