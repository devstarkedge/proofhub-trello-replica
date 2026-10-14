// Older deployments can omit filter metadata. Missing capability flags must
// remain false; never infer broader visibility from the user's identity role.
export function normalizeLeaveDashboardResponse(payload) {
  const data = payload?.data;
  if (!data || !Array.isArray(data.requests) || data.requests.some((request) => !request || typeof request !== 'object')) {
    throw new Error('Unable to load leave requests: the leave service returned an unexpected response. Please refresh to retry.');
  }
  const filters = data.filters || {};
  return { ...payload, data: { ...data, filters: {
    ...filters,
    canApprove: filters.canApprove === true,
    canViewMine: filters.canViewMine === true,
    canFilterPeople: filters.canFilterPeople === true,
    departments: Array.isArray(filters.departments) ? filters.departments.filter(Boolean) : [],
    leaveTypes: Array.isArray(filters.leaveTypes) ? filters.leaveTypes.filter(Boolean) : [],
  } } };
}
