import express from 'express';
import { getUserAnalytics, getBoardAnalytics, getProjectsAnalytics, getDepartmentAnalytics, getDashboardData } from '../controllers/analyticsController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/user/:userId', protect, getUserAnalytics);
router.get('/projects/:departmentId', protect, getProjectsAnalytics);
router.get('/department/:departmentId', protect, getDepartmentAnalytics);
router.get('/dashboard', protect, getDashboardData);

export default router;
