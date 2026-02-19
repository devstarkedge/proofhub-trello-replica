import express from 'express';
import { getUserAnalytics, getBoardAnalytics, getProjectsAnalytics, getDepartmentAnalytics } from '../controllers/analyticsController.js';
import { protect } from '../middleware/authMiddleware.js';
import { cacheMiddleware } from '../middleware/cache.js';

const router = express.Router();

router.get('/user/:userId', protect, cacheMiddleware('analytics', 300), getUserAnalytics);
router.get('/projects/:departmentId', protect, cacheMiddleware('analytics', 300), getProjectsAnalytics);
router.get('/department/:departmentId', protect, cacheMiddleware('analytics', 300), getDepartmentAnalytics);

export default router;

