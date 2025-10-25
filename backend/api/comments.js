import express from 'express';
import { body } from 'express-validator';
import { getComments, createComment, updateComment, deleteComment } from '../controllers/commentController.js';
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

router.get('/card/:cardId', protect, async (req, res) => {
  try {
    await getComments(req, res);
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ message: 'Failed to get comments' });
  }
});

router.post('/', protect, [
  body('content').trim().notEmpty().withMessage('Comment content is required'),
  body('cardId').notEmpty().withMessage('Card ID is required'),
  validate
], async (req, res) => {
  try {
    await createComment(req, res);
  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({ message: 'Failed to create comment' });
  }
});

router.put('/:id', protect, [
  body('content').trim().notEmpty().withMessage('Comment content is required'),
  validate
], async (req, res) => {
  try {
    await updateComment(req, res);
  } catch (error) {
    console.error('Update comment error:', error);
    res.status(500).json({ message: 'Failed to update comment' });
  }
});

router.delete('/:id', protect, async (req, res) => {
  try {
    await deleteComment(req, res);
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ message: 'Failed to delete comment' });
  }
});

export default router;
