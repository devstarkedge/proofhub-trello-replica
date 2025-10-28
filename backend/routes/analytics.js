import express from 'express';
import { getTeamAnalytics, getUserAnalytics, getBoardAnalytics, getProjectsAnalytics } from '../controllers/analyticsController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/team/:teamId', protect, getTeamAnalytics);
router.get('/user/:userId', protect, getUserAnalytics);
router.get('/projects/:departmentId', protect, getProjectsAnalytics);

export default router;
