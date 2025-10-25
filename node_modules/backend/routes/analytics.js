import express from 'express';
import { getTeamAnalytics, getUserAnalytics, getBoardAnalytics } from '../controllers/analyticsController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/team/:teamId', protect, getTeamAnalytics);
router.get('/user/:userId', protect, getUserAnalytics);
router.get('/board/:boardId', protect, getBoardAnalytics);

export default router;
