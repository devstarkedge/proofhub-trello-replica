import api from './api';

const API_BASE_URL = '/api/announcements';

const announcementService = {
  // Get all announcements
  getAnnouncements: async (params = {}) => {
    try {
      const response = await api.get(API_BASE_URL, { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Get single announcement
  getAnnouncement: async (id) => {
    try {
      const response = await api.get(`${API_BASE_URL}/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Create announcement
  createAnnouncement: async (data, files = []) => {
    try {
      const formData = new FormData();

      // Add text fields - serialize objects as JSON strings
      Object.keys(data).forEach(key => {
        if (typeof data[key] === 'object' && data[key] !== null) {
          // Stringify nested objects (subscribers, lastFor)
          formData.append(key, JSON.stringify(data[key]));
        } else if (typeof data[key] === 'boolean') {
          // Explicitly append booleans
          formData.append(key, data[key].toString());
        } else if (data[key] !== null && data[key] !== undefined && data[key] !== '') {
          // Only append non-empty values
          formData.append(key, data[key]);
        }
      });

      // Add files
      files.forEach(file => {
        formData.append('attachments', file);
      });

      const response = await api.post(API_BASE_URL, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Update announcement
  updateAnnouncement: async (id, data) => {
    try {
      const response = await api.put(`${API_BASE_URL}/${id}`, data);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Delete announcement
  deleteAnnouncement: async (id) => {
    try {
      const response = await api.delete(`${API_BASE_URL}/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Add comment
  addComment: async (announcementId, text) => {
    try {
      const response = await api.post(`${API_BASE_URL}/${announcementId}/comments`, { text });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Delete comment
  deleteComment: async (announcementId, commentId) => {
    try {
      const response = await api.delete(`${API_BASE_URL}/${announcementId}/comments/${commentId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Add reaction
  addReaction: async (announcementId, emoji) => {
    try {
      const response = await api.post(`${API_BASE_URL}/${announcementId}/reactions`, { emoji });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Remove reaction
  removeReaction: async (announcementId, emoji) => {
    try {
      const response = await api.delete(`${API_BASE_URL}/${announcementId}/reactions/${emoji}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Pin/Unpin announcement
  togglePin: async (announcementId, pin) => {
    try {
      const response = await api.put(`${API_BASE_URL}/${announcementId}/pin`, { pin });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Archive/Unarchive announcement
  toggleArchive: async (announcementId, archive) => {
    try {
      const response = await api.put(`${API_BASE_URL}/${announcementId}/archive`, { archive });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Extend expiry
  extendExpiry: async (announcementId, value, unit) => {
    try {
      const response = await api.put(`${API_BASE_URL}/${announcementId}/extend-expiry`, { value, unit });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Get statistics
  getStats: async () => {
    try {
      const response = await api.get(`${API_BASE_URL}/stats/overview`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  }
};

export default announcementService;
