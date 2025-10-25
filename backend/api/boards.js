import express from 'express';
import { body } from 'express-validator';
import { getBoards, getBoard, createBoard, updateBoard, deleteBoard, getBoardsByDepartment, getWorkflowData } from '../controllers/boardController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
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
    await getBoards(req, res);
  } catch (error) {
    console.error('Get boards error:', error);
    res.status(500).json({ message: 'Failed to get boards' });
  }
});

router.get('/department/:departmentId', protect, async (req, res) => {
  try {
    await getBoardsByDepartment(req, res);
  } catch (error) {
    console.error('Get boards by department error:', error);
    res.status(500).json({ message: 'Failed to get department boards' });
  }
});

router.get('/workflow/:departmentId/:projectId', protect, async (req, res) => {
  try {
    await getWorkflowData(req, res);
  } catch (error) {
    console.error('Get workflow data error:', error);
    res.status(500).json({ message: 'Failed to get workflow data' });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    await getBoard(req, res);
  } catch (error) {
    console.error('Get board error:', error);
    res.status(500).json({ message: 'Failed to get board' });
  }
});

router.post('/', protect, upload.array('attachments', 10), [
  body('name').trim().notEmpty().withMessage('Board name is required'),
  validate
], async (req, res) => {
  try {
    await createBoard(req, res);
  } catch (error) {
    console.error('Create board error:', error);
    res.status(500).json({ message: 'Failed to create board' });
  }
});

router.put('/:id', protect, async (req, res) => {
  try {
    await updateBoard(req, res);
  } catch (error) {
    console.error('Update board error:', error);
    res.status(500).json({ message: 'Failed to update board' });
  }
});

router.delete('/:id', protect, async (req, res) => {
  try {
    await deleteBoard(req, res);
  } catch (error) {
    console.error('Delete board error:', error);
    res.status(500).json({ message: 'Failed to delete board' });
  }
});

export default router;
