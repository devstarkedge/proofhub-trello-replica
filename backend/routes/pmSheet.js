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

const router = express.Router();

// All routes require authentication and admin/manager role
router.use(protect);
router.use(authorize('admin', 'manager'));

// PM Sheet Dashboard - Department -> Month -> Week -> User breakdown
router.get('/dashboard', getDashboardData);

// Month Wise PM Report - Full month summary per user
router.get('/month-wise', getMonthWiseReport);

// Project Coordinator Report - User-centric, coordinator-filtered view
router.get('/coordinator-report', getCoordinatorReport);

// Approach Page - Completed work & payment review
router.get('/approach', getApproachData);

// Get filter options (departments, users, projects, etc.)
router.get('/filters', getFilterOptions);

// Get summary statistics
router.get('/summary', getSummaryStats);

// Update project status (for marking completion from any PM Sheet page)
router.patch('/project/:projectId/status', updateProjectStatus);

export default router;
