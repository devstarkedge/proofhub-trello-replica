import api from './api';

const enterpriseInquiryService = {
  async submit(payload) {
    const response = await api.post('/api/enterprise-inquiries', payload);
    return response.data;
  },
};

export default enterpriseInquiryService;
