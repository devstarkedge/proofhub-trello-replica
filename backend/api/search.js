import express from 'express';
import { searchAll, searchBoards, searchCards, searchUsers } from '../controllers/searchController.js';
import { protect } from '../middleware/authMiddleware.js';
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
    await searchAll(req, res);
  } catch (error) {
    console.error('Search all error:', error);
    res.status(500).json({ message: 'Search failed' });
  }
});

router.get('/boards', protect, async (req, res) => {
  try {
    await searchBoards(req, res);
  } catch (error) {
    console.error('Search boards error:', error);
    res.status(500).json({ message: 'Board search failed' });
  }
});

router.get('/cards', protect, async (req, res) => {
  try {
    await searchCards(req, res);
  } catch (error) {
    console.error('Search cards error:', error);
    res.status(500).json({ message: 'Card search failed' });
  }
});

router.get('/users', protect, async (req, res) => {
  try {
    await searchUsers(req, res);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ message: 'User search failed' });
  }
});

export default router;
