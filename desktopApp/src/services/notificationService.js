import axios from 'axios';

const API_URL = '/api/notifications';

// Subscribe to coming soon feature
export const subscribeToFeature = async (email, feature) => {
  try {
    const response = await axios.post(`${API_URL}/subscribe`, { email, feature });
    return response.data;
  } catch (error) {
    throw error.response?.data?.msg || 'Subscription failed';
  }
};
