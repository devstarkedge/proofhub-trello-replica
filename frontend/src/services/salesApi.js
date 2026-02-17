import axios from 'axios';
import { toast } from 'react-toastify';

const baseURL = import.meta.env.VITE_BACKEND_URL;

// Create axios instance with base config
const api = axios.create({
  baseURL: `${baseURL}/api/sales`,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add auth token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || 'An error occurred';
    
    // Don't show toast for 403 permission errors or 423 lock errors (component will handle)
    if (![403, 423].includes(error.response?.status)) {
      toast.error(message);
    }
    
    return Promise.reject(error);
  }
);

// ============================================
// SALES ROWS API
// ============================================

/**
 * Get all sales rows with filters and pagination
 */
export const getSalesRows = async (params = {}) => {
  const { data } = await api.get('/rows', { params });
  return data;
};

/**
 * Get single sales row by ID
 */
export const getSalesRowById = async (id) => {
  const { data } = await api.get(`/rows/${id}`);
  return data;
};

/**
 * Create new sales row
 */
export const createSalesRow = async (rowData) => {
  const { data } = await api.post('/rows', rowData);
  toast.success(data.message || 'Sales row created successfully');
  return data;
};

/**
 * Update sales row
 */
export const updateSalesRow = async (id, updates) => {
  const { data } = await api.put(`/rows/${id}`, updates);
  toast.success(data.message || 'Sales row updated successfully');
  return data;
};

/**
 * Delete sales row
 */
export const deleteSalesRow = async (id) => {
  const { data } = await api.delete(`/rows/${id}`);
  // No toast here; handled in store or socket event
  return data;
};

/**
 * Bulk update sales rows
 */
export const bulkUpdateRows = async (rowIds, updates) => {
  const { data } = await api.post('/rows/bulk-update', { rowIds, updates });
  toast.success(data.message || 'Rows updated successfully');
  return data;
};

/**
 * Bulk delete sales rows
 */
export const bulkDeleteRows = async (rowIds) => {
  const { data } = await api.post('/rows/bulk-delete', { rowIds });
  toast.success(data.message || 'Rows deleted successfully');
  return data;
};

/**
 * Lock row for editing
 */
export const lockRow = async (id) => {
  const { data } = await api.post(`/rows/${id}/lock`);
  return data;
};

/**
 * Unlock row
 */
export const unlockRow = async (id) => {
  const { data } = await api.post(`/rows/${id}/unlock`);
  return data;
};

/**
 * Get activity log for a row
 */
export const getActivityLog = async (id, params = {}) => {
  const { data } = await api.get(`/rows/${id}/activity`, { params });
  return data;
};

/**
 * Export sales rows (respects current filters and sorting)
 */
export const exportRows = async (format = 'csv', rowIds = null, filterParams = {}) => {
  const params = { format, ...filterParams };
  if (rowIds && rowIds.length > 0) {
    params.rowIds = rowIds.join(',');
  }
  
  const response = await api.get('/rows/export', {
    params,
    responseType: 'blob'
  });
  
  // Create download link
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `sales_export_${new Date().toISOString().split('T')[0]}.${format === 'xlsx' ? 'xlsx' : 'csv'}`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  
  toast.success('Export completed successfully');
  return response;
};

/**
 * Import sales rows from file data
 * @param {Array} data - Array of row objects
 * @param {Array} newColumns - Optional array of { name, type } for auto-creating columns
 */
export const importRows = async (data, newColumns = null) => {
  const payload = { data };
  if (newColumns && newColumns.length > 0) {
    payload.newColumns = newColumns;
  }
  const response = await api.post('/rows/import', payload);
  return response.data;
};

// ============================================
// DROPDOWN MANAGEMENT API
// ============================================

/**
 * Get dropdown options for a column
 */
export const getDropdownOptions = async (columnName) => {
  const { data } = await api.get(`/dropdowns/${columnName}`);
  return data;
};

/**
 * Add new dropdown option
 */
export const addDropdownOption = async (columnName, optionData) => {
  const { data } = await api.post(`/dropdowns/${columnName}`, optionData);
  toast.success(data.message || 'Option added successfully');
  return data;
};

/**
 * Update dropdown option
 */
export const updateDropdownOption = async (columnName, optionId, updates) => {
  const { data } = await api.put(`/dropdowns/${columnName}/${optionId}`, updates);
  toast.success(data.message || 'Option updated successfully');
  return data;
};

/**
 * Delete dropdown option
 */
export const deleteDropdownOption = async (columnName, optionId) => {
  const { data } = await api.delete(`/dropdowns/${columnName}/${optionId}`);
  toast.success(data.message || 'Option deleted successfully');
  return data;
};

// ============================================
// CUSTOM COLUMNS API
// ============================================

/**
 * Get all custom columns
 */
export const getCustomColumns = async () => {
  const { data } = await api.get('/columns');
  return data;
};

/**
 * Create new custom column
 */
export const createCustomColumn = async (columnData) => {
  const { data } = await api.post('/columns', columnData);
  toast.success(data.message || 'Column created successfully');
  return data;
};

/**
 * Update custom column
 */
export const updateCustomColumn = async (columnId, columnData) => {
  const { data } = await api.put(`/columns/${columnId}`, columnData);
  toast.success(data.message || 'Column updated successfully');
  return data;
};

/**
 * Delete custom column
 */
export const deleteCustomColumn = async (columnId) => {
  const { data } = await api.delete(`/columns/${columnId}`);
  toast.success(data.message || 'Column deleted successfully');
  return data;
};

// ============================================
// PERMISSIONS API
// ============================================

/**
 * Get user permissions
 */
export const getUserPermissions = async (userId) => {
  const { data } = await api.get(`/permissions/${userId}`);
  return data;
};

/**
 * Update user permissions (admin only)
 */
export const updateUserPermissions = async (userId, permissions) => {
  const { data } = await api.put(`/permissions/${userId}`, permissions);
  toast.success(data.message || 'Permissions updated successfully');
  return data;
};
