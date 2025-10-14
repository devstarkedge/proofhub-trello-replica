import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import { getCompletionRate, getOverdueTasks, getWorkloadByUser } from '../controllers/analyticsController.js';

const router = express.Router();

// Get task completion rate
router.get('/completion-rate', authMiddleware, getCompletionRate);

// Get overdue tasks
router.get('/overdue', authMiddleware, getOverdueTasks);

// Get workload distribution
router.get('/workload', authMiddleware, getWorkloadByUser);

export default router;
