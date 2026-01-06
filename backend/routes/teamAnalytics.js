import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getTeamLoggedTime,
  getSmartInsights,
  getDepartmentAnalytics,
  getDailyTrends,
  getMyLoggedTimeSummary
} from '../controllers/teamAnalyticsController.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Team logged time analytics
router.get('/logged-time', getTeamLoggedTime);

// Smart insights (Admin/Manager only)
router.get('/insights', getSmartInsights);

// Department-wise analytics (Admin/Manager only)
router.get('/departments', getDepartmentAnalytics);

// Daily/Weekly/Monthly trends
router.get('/trends', getDailyTrends);

// Personal summary for logged-in user
router.get('/my-summary', getMyLoggedTimeSummary);

export default router;
