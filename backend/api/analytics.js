import express from 'express';
import { getAnalytics, getBoardAnalytics, getUserAnalytics, getTeamAnalytics } from '../controllers/analyticsController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import connectDB from '../utils/db.js';

const router = express.Router();

// Connect to database
router.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ message: 'Database connection failed' });
  }
});

router.get('/', protect, async (req, res) => {
  try {
    await getAnalytics(req, res);
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ message: 'Failed to get analytics' });
  }
});

router.get('/board/:boardId', protect, async (req, res) => {
  try {
    await getBoardAnalytics(req, res);
  } catch (error) {
    console.error('Get board analytics error:', error);
    res.status(500).json({ message: 'Failed to get board analytics' });
  }
});

router.get('/user/:userId', protect, async (req, res) => {
  try {
    await getUserAnalytics(req, res);
  } catch (error) {
    console.error('Get user analytics error:', error);
    res.status(500).json({ message: 'Failed to get user analytics' });
  }
});

router.get('/team/:teamId', protect, async (req, res) => {
  try {
    await getTeamAnalytics(req, res);
  } catch (error) {
    console.error('Get team analytics error:', error);
    res.status(500).json({ message: 'Failed to get team analytics' });
  }
});

export default router;
