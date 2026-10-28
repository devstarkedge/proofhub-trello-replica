import express from 'express';
import { 
  getFinanceSummary,
  getUserFinanceData,
  getProjectFinanceData,
  getFinanceDepartments,
  getFinanceFilterOptions,
  getWeeklyReportData,
  getUserContributions,
  getYearWideWeeklyData
} from '../controllers/financeController.js';
import {
  getFinancePages,
  getFinancePageById,
  createFinancePage,
  updateFinancePage,
  approveFinancePage,
  deleteFinancePage,
  getPendingPages,
  reorderFinancePages
} from '../controllers/financePageController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { checkFinanceAccess, requireFinancePermission } from '../middleware/financePermissionMiddleware.js';


const router = express.Router();

/**
 * Finance Routes
 * All routes require authentication and Finance page access
 */

// Apply authentication and granular finance access to all routes
router.use(protect);
router.use(checkFinanceAccess);

// ============================================
// CORE FINANCE DATA ROUTES
// ============================================

// Dashboard summary - All key metrics
router.get('/summary', requireFinancePermission('revenueAnalytics'), getFinanceSummary);

// User-centric finance data (Users tab)
router.get('/users', requireFinancePermission('billingDetails'), getUserFinanceData);

// Project-centric finance data (Projects tab)
router.get('/projects', requireFinancePermission('billingDetails'), getProjectFinanceData);

// Weekly report data
router.get('/weekly', requireFinancePermission('billingDetails'), getWeeklyReportData);

// Year-wide weekly report data (for week-wise reporting mode)
router.get('/weekly-report/year', requireFinancePermission('billingDetails'), getYearWideWeeklyData);

// User contributions per project
router.get('/projects/:projectId/contributions', requireFinancePermission('billingDetails'), getUserContributions);

// Get all departments for filtering
router.get('/departments', getFinanceDepartments);

// Get all filter options (departments, users, projects, billing types)
router.get('/filters', getFinanceFilterOptions);

// ============================================
// CUSTOM PAGES ROUTES
// ============================================

// Get all pages (filtered by user role)
router.get('/pages', getFinancePages);

// Get pending pages (Admin only)
router.get('/pages/pending', authorize('admin'), getPendingPages);

// Get single page
router.get('/pages/:id', getFinancePageById);

// Create new page
router.post('/pages', authorize('admin', 'manager'), createFinancePage);

// Reorder pages
router.put('/pages/reorder', authorize('admin', 'manager'), reorderFinancePages);

// Update page
router.put('/pages/:id', authorize('admin', 'manager'), updateFinancePage);

// Approve/Reject page (Admin only)
router.put('/pages/:id/approve', authorize('admin'), approveFinancePage);

// Delete (archive) page
router.delete('/pages/:id', authorize('admin', 'manager'), deleteFinancePage);

export default router;
