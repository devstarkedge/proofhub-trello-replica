import api from './api';

/**
 * PM Sheet Service - Handles all PM Sheet related API calls
 * No caching - always fetches fresh real-time data
 */

const PM_SHEET_BASE = '/api/pm-sheet';

/**
 * Get PM Sheet Dashboard Data
 * Department -> Month -> Week -> User breakdown
 */
export const getDashboardData = async (filters = {}) => {
  const params = new URLSearchParams();
  
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  if (filters.userId) params.append('userId', filters.userId);
  if (filters.departmentId) params.append('departmentId', filters.departmentId);
  if (filters.projectId) params.append('projectId', filters.projectId);
  if (filters.billingType) params.append('billingType', filters.billingType);
  if (filters.projectCategory) params.append('projectCategory', filters.projectCategory);
  if (filters.coordinatorId) params.append('coordinatorId', filters.coordinatorId);
  if (filters.status) params.append('status', filters.status);

  const response = await api.get(`${PM_SHEET_BASE}/dashboard?${params.toString()}`);
  return response.data;
};

/**
 * Get Month Wise PM Report
 * Full month summary per user, department-wise sections
 */
export const getMonthWiseReport = async (filters = {}) => {
  const params = new URLSearchParams();
  
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  if (filters.userId) params.append('userId', filters.userId);
  if (filters.departmentId) params.append('departmentId', filters.departmentId);
  if (filters.projectId) params.append('projectId', filters.projectId);
  if (filters.billingType) params.append('billingType', filters.billingType);

  const response = await api.get(`${PM_SHEET_BASE}/month-wise?${params.toString()}`);
  return response.data;
};

/**
 * Get Project Coordinator Report
 * User-centric, coordinator-filtered view with week-wise grouping
 */
export const getCoordinatorReport = async (filters = {}) => {
  const params = new URLSearchParams();
  
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  if (filters.userId) params.append('userId', filters.userId);
  if (filters.departmentId) params.append('departmentId', filters.departmentId);
  if (filters.coordinatorId) params.append('coordinatorId', filters.coordinatorId);

  const response = await api.get(`${PM_SHEET_BASE}/coordinator-report?${params.toString()}`);
  return response.data;
};

/**
 * Get Approach Page Data
 * Completed work & payment review
 */
export const getApproachData = async (filters = {}) => {
  const params = new URLSearchParams();
  
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  if (filters.userId) params.append('userId', filters.userId);
  if (filters.departmentId) params.append('departmentId', filters.departmentId);
  if (filters.projectId) params.append('projectId', filters.projectId);
  if (filters.status) params.append('status', filters.status || 'completed');

  const response = await api.get(`${PM_SHEET_BASE}/approach?${params.toString()}`);
  return response.data;
};

/**
 * Get filter options for PM Sheet pages
 * Returns departments, users, projects, categories, coordinators, etc.
 */
export const getFilterOptions = async () => {
  const response = await api.get(`${PM_SHEET_BASE}/filters`);
  return response.data;
};

/**
 * Get summary statistics for PM Sheet
 */
export const getSummaryStats = async (filters = {}) => {
  const params = new URLSearchParams();
  
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);

  const response = await api.get(`${PM_SHEET_BASE}/summary?${params.toString()}`);
  return response.data;
};

/**
 * Update project status
 * Can be used to mark projects as completed from any PM Sheet page
 */
export const updateProjectStatus = async (projectId, status) => {
  const response = await api.patch(`${PM_SHEET_BASE}/project/${projectId}/status`, { status });
  return response.data;
};

// Date preset helpers
export const getDatePresets = () => {
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last2Months = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const last6Months = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  return {
    thisMonth: {
      label: 'This Month',
      startDate: thisMonth.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0]
    },
    last2Months: {
      label: 'Last 2 Months',
      startDate: last2Months.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0]
    },
    last6Months: {
      label: 'Last 6 Months',
      startDate: last6Months.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0]
    },
    allMonths: {
      label: 'All Months',
      startDate: startOfYear.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0]
    }
  };
};

// Format time helper for display
export const formatTimeDisplay = (timeObj) => {
  if (!timeObj) return '0h 0m';
  if (typeof timeObj === 'string') return timeObj;
  return timeObj.display || `${timeObj.hours || 0}h ${timeObj.minutes || 0}m`;
};

// Format currency helper
export const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount || 0);
};

export default {
  getDashboardData,
  getMonthWiseReport,
  getCoordinatorReport,
  getApproachData,
  getFilterOptions,
  getSummaryStats,
  updateProjectStatus,
  getDatePresets,
  formatTimeDisplay,
  formatCurrency
};
