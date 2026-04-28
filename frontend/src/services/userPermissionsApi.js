import api from './api';

const FINANCE_PAGE_KEY = 'finance';

export const getUserPagePermissions = async (userId, pageKey = FINANCE_PAGE_KEY) => {
  const { data } = await api.get(`/api/users/${userId}/permissions`, {
    params: { pageKey }
  });
  return data?.data;
};

export const patchUserPagePermissions = async (userId, payload) => {
  const { data } = await api.patch(`/api/users/${userId}/permissions`, {
    pageKey: FINANCE_PAGE_KEY,
    ...payload
  });
  return data?.data;
};

export { FINANCE_PAGE_KEY };
