import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getTeamLoggedTime,
  getSmartInsights,
  getDepartmentAnalytics,
  getDailyTrends,
  getMyLoggedTimeSummary,
  getDateHoverDetails,
  getDateDetailedLogs
} from '../controllers/teamAnalyticsController.js';
import { cacheMiddleware } from '../middleware/cache.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Team logged time analytics
router.get('/logged-time', cacheMiddleware('team-analytics', 300), getTeamLoggedTime);

// Smart insights (Admin/Manager only)
router.get('/insights', cacheMiddleware('team-analytics', 300), getSmartInsights);

// Department-wise analytics (Admin/Manager only)
router.get('/departments', cacheMiddleware('team-analytics', 300), getDepartmentAnalytics);

// Daily/Weekly/Monthly trends
router.get('/trends', cacheMiddleware('team-analytics', 300), getDailyTrends);

// Personal summary for logged-in user
router.get('/my-summary', cacheMiddleware('team-analytics', 180), getMyLoggedTimeSummary);

// Date-specific hover details (lightweight task summary)
router.get('/date-hover/:userId/:date', cacheMiddleware('team-analytics', 120), getDateHoverDetails);

// Date-specific detailed logs (full hierarchy for modal)
router.get('/date-details/:userId/:date', cacheMiddleware('team-analytics', 120), getDateDetailedLogs);

export default router;

