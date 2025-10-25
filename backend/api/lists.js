import express from 'express';
import { body } from 'express-validator';
import { getLists, getList, createList, updateList, deleteList, moveList } from '../controllers/listController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';
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
    await getLists(req, res);
  } catch (error) {
    console.error('Get lists error:', error);
    res.status(500).json({ message: 'Failed to get lists' });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    await getList(req, res);
  } catch (error) {
    console.error('Get list error:', error);
    res.status(500).json({ message: 'Failed to get list' });
  }
});

router.post('/', protect, [
  body('name').trim().notEmpty().withMessage('List name is required'),
  body('boardId').notEmpty().withMessage('Board ID is required'),
  validate
], async (req, res) => {
  try {
    await createList(req, res);
  } catch (error) {
    console.error('Create list error:', error);
    res.status(500).json({ message: 'Failed to create list' });
  }
});

router.put('/:id', protect, async (req, res) => {
  try {
    await updateList(req, res);
  } catch (error) {
    console.error('Update list error:', error);
    res.status(500).json({ message: 'Failed to update list' });
  }
});

router.delete('/:id', protect, async (req, res) => {
  try {
    await deleteList(req, res);
  } catch (error) {
    console.error('Delete list error:', error);
    res.status(500).json({ message: 'Failed to delete list' });
  }
});

router.put('/:id/move', protect, [
  body('position').isInt({ min: 0 }).withMessage('Position must be a non-negative integer'),
  validate
], async (req, res) => {
  try {
    await moveList(req, res);
  } catch (error) {
    console.error('Move list error:', error);
    res.status(500).json({ message: 'Failed to move list' });
  }
});

export default router;
