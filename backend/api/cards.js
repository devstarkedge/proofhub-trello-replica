import express from 'express';
import { body } from 'express-validator';
import { getCards, getCard, createCard, updateCard, deleteCard, moveCard, addAttachment, removeAttachment } from '../controllers/cardController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';
import upload from '../middleware/upload.js';
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
    await getCards(req, res);
  } catch (error) {
    console.error('Get cards error:', error);
    res.status(500).json({ message: 'Failed to get cards' });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    await getCard(req, res);
  } catch (error) {
    console.error('Get card error:', error);
    res.status(500).json({ message: 'Failed to get card' });
  }
});

router.post('/', protect, upload.array('attachments', 10), [
  body('title').trim().notEmpty().withMessage('Card title is required'),
  body('listId').notEmpty().withMessage('List ID is required'),
  validate
], async (req, res) => {
  try {
    await createCard(req, res);
  } catch (error) {
    console.error('Create card error:', error);
    res.status(500).json({ message: 'Failed to create card' });
  }
});

router.put('/:id', protect, async (req, res) => {
  try {
    await updateCard(req, res);
  } catch (error) {
    console.error('Update card error:', error);
    res.status(500).json({ message: 'Failed to update card' });
  }
});

router.delete('/:id', protect, async (req, res) => {
  try {
    await deleteCard(req, res);
  } catch (error) {
    console.error('Delete card error:', error);
    res.status(500).json({ message: 'Failed to delete card' });
  }
});

router.put('/:id/move', protect, [
  body('listId').notEmpty().withMessage('List ID is required'),
  body('position').isInt({ min: 0 }).withMessage('Position must be a non-negative integer'),
  validate
], async (req, res) => {
  try {
    await moveCard(req, res);
  } catch (error) {
    console.error('Move card error:', error);
    res.status(500).json({ message: 'Failed to move card' });
  }
});

router.post('/:id/attachments', protect, upload.array('attachments', 5), async (req, res) => {
  try {
    await addAttachment(req, res);
  } catch (error) {
    console.error('Add attachment error:', error);
    res.status(500).json({ message: 'Failed to add attachment' });
  }
});

router.delete('/:id/attachments/:attachmentId', protect, async (req, res) => {
  try {
    await removeAttachment(req, res);
  } catch (error) {
    console.error('Remove attachment error:', error);
    res.status(500).json({ message: 'Failed to remove attachment' });
  }
});

export default router;
