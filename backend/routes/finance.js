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
import { cacheMiddleware } from '../middleware/cache.js';


const router = express.Router();

/**
 * Finance Routes
 * All routes require authentication and Admin/Manager role
 */

// Apply authentication and role-based access to all routes
router.use(protect);
router.use(authorize('admin', 'manager'));

// ============================================
// CORE FINANCE DATA ROUTES
// ============================================

// Dashboard summary - All key metrics
router.get('/summary', cacheMiddleware('finance', 600), getFinanceSummary);

// User-centric finance data (Users tab)
router.get('/users', cacheMiddleware('finance', 600), getUserFinanceData);

// Project-centric finance data (Projects tab)
router.get('/projects', cacheMiddleware('finance', 600), getProjectFinanceData);

// Weekly report data
router.get('/weekly', cacheMiddleware('finance', 600), getWeeklyReportData);

// Year-wide weekly report data (for week-wise reporting mode)
router.get('/weekly-report/year', cacheMiddleware('finance', 600), getYearWideWeeklyData);

// User contributions per project
router.get('/projects/:projectId/contributions', cacheMiddleware('finance', 300), getUserContributions);

// Get all departments for filtering
router.get('/departments', cacheMiddleware('finance', 600), getFinanceDepartments);

// Get all filter options (departments, users, projects, billing types)
router.get('/filters', cacheMiddleware('finance', 600), getFinanceFilterOptions);

// ============================================
// CUSTOM PAGES ROUTES
// ============================================

// Get all pages (filtered by user role)
router.get('/pages', cacheMiddleware('finance', 300), getFinancePages);

// Get pending pages (Admin only)
router.get('/pages/pending', authorize('admin'), cacheMiddleware('finance', 120), getPendingPages);

// Get single page
router.get('/pages/:id', cacheMiddleware('finance', 300), getFinancePageById);

// Create new page
router.post('/pages', createFinancePage);

// Update page
router.put('/pages/:id', updateFinancePage);

// Approve/Reject page (Admin only)
router.put('/pages/:id/approve', authorize('admin'), approveFinancePage);

// Reorder pages
router.put('/pages/reorder', reorderFinancePages);

// Delete (archive) page
router.delete('/pages/:id', deleteFinancePage);

export default router;
