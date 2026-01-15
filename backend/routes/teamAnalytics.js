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

// Date-specific hover details (lightweight task summary)
router.get('/date-hover/:userId/:date', getDateHoverDetails);

// Date-specific detailed logs (full hierarchy for modal)
router.get('/date-details/:userId/:date', getDateDetailedLogs);

export default router;

