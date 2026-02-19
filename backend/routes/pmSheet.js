import express from 'express';
import { 
  getDashboardData,
  getMonthWiseReport,
  getCoordinatorReport,
  getApproachData,
  getFilterOptions,
  updateProjectStatus,
  getSummaryStats
} from '../controllers/pmSheetController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { cacheMiddleware } from '../middleware/cache.js';

const router = express.Router();

// All routes require authentication and admin/manager role
router.use(protect);
router.use(authorize('admin', 'manager'));

// PM Sheet Dashboard - Department -> Month -> Week -> User breakdown
router.get('/dashboard', cacheMiddleware('pm-sheet', 300), getDashboardData);

// Month Wise PM Report - Full month summary per user
router.get('/month-wise', cacheMiddleware('pm-sheet', 300), getMonthWiseReport);

// Project Coordinator Report - User-centric, coordinator-filtered view
router.get('/coordinator-report', cacheMiddleware('pm-sheet', 300), getCoordinatorReport);

// Approach Page - Completed work & payment review
router.get('/approach', cacheMiddleware('pm-sheet', 300), getApproachData);

// Get filter options (departments, users, projects, etc.)
router.get('/filters', cacheMiddleware('pm-sheet', 600), getFilterOptions);

// Get summary statistics
router.get('/summary', cacheMiddleware('pm-sheet', 300), getSummaryStats);

// Update project status (for marking completion from any PM Sheet page)
router.patch('/project/:projectId/status', updateProjectStatus);

export default router;
