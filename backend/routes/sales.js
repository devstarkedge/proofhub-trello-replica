import express from 'express';
import {
  getSalesRows,
  getSalesRowById,
  createSalesRow,
  updateSalesRow,
  deleteSalesRow,
  bulkUpdateRows,
  bulkDeleteRows,
  lockRow,
  unlockRow,
  getActivityLog,
  exportRows,
  importRows,
  getDropdownOptions,
  addDropdownOption,
  updateDropdownOption,
  deleteDropdownOption,
  getCustomColumns,
  createCustomColumn,
  getUserPermissions,
  updateUserPermissions
} from '../controllers/salesController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { checkSalesPermission, requireSalesPermission } from '../middleware/salesPermissionMiddleware.js';

const router = express.Router();

/**
 * All routes require authentication and sales module permission
 */
router.use(protect);
router.use(checkSalesPermission);

// ============================================
// SALES ROWS ROUTES
// ============================================

// Get all sales rows with filters/search
router.get('/rows', getSalesRows);

// Export sales rows (requires canExport)
router.get('/rows/export', requireSalesPermission('canExport'), exportRows);

// Import sales rows (requires canImport)
router.post('/rows/import', requireSalesPermission('canImport'), importRows);

// Bulk update (requires canUpdate)
router.post('/rows/bulk-update', requireSalesPermission('canUpdate'), bulkUpdateRows);

// Bulk delete (requires canDelete)
router.post('/rows/bulk-delete', requireSalesPermission('canDelete'), bulkDeleteRows);

// Get single sales row
router.get('/rows/:id', getSalesRowById);

// Create new sales row (requires canCreate)
router.post('/rows', requireSalesPermission('canCreate'), createSalesRow);

// Update sales row (requires canUpdate)
router.put('/rows/:id', requireSalesPermission('canUpdate'), updateSalesRow);

// Delete sales row (requires canDelete)
router.delete('/rows/:id', requireSalesPermission('canDelete'), deleteSalesRow);

// Lock/unlock row for editing
router.post('/rows/:id/lock', lockRow);
router.post('/rows/:id/unlock', unlockRow);

// Get activity log (requires canViewActivityLog)
router.get('/rows/:id/activity', requireSalesPermission('canViewActivityLog'), getActivityLog);

// ============================================
// DROPDOWN MANAGEMENT ROUTES
// ============================================

// Get dropdown options for a column
router.get('/dropdowns/:columnName', getDropdownOptions);

// Add dropdown option (requires canManageDropdowns)
router.post('/dropdowns/:columnName', requireSalesPermission('canManageDropdowns'), addDropdownOption);

// Update dropdown option (requires canManageDropdowns)
router.put('/dropdowns/:columnName/:id', requireSalesPermission('canManageDropdowns'), updateDropdownOption);

// Delete dropdown option (requires canManageDropdowns)
router.delete('/dropdowns/:columnName/:id', requireSalesPermission('canManageDropdowns'), deleteDropdownOption);

// ============================================
// CUSTOM COLUMNS ROUTES
// ============================================

// Get custom columns
router.get('/columns', getCustomColumns);

// Create custom column (requires canManageDropdowns)
router.post('/columns', requireSalesPermission('canManageDropdowns'), createCustomColumn);

// ============================================
// PERMISSIONS ROUTES
// ============================================

// Get user permissions (self or admin)
router.get('/permissions/:userId', getUserPermissions);

// Update user permissions (admin only)
router.put('/permissions/:userId', authorize('admin'), updateUserPermissions);

export default router;
