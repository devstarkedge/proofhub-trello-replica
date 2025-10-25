import express from 'express';
import { body } from 'express-validator';
import { getDepartments, getDepartment, createDepartment, updateDepartment, deleteDepartment, addMember, removeMember } from '../controllers/departmentController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
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
    await getDepartments(req, res);
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ message: 'Failed to get departments' });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    await getDepartment(req, res);
  } catch (error) {
    console.error('Get department error:', error);
    res.status(500).json({ message: 'Failed to get department' });
  }
});

router.post('/', protect, authorize('admin'), [
  body('name').trim().notEmpty().withMessage('Department name is required'),
  body('description').optional().trim(),
  validate
], async (req, res) => {
  try {
    await createDepartment(req, res);
  } catch (error) {
    console.error('Create department error:', error);
    res.status(500).json({ message: 'Failed to create department' });
  }
});

router.put('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    await updateDepartment(req, res);
  } catch (error) {
    console.error('Update department error:', error);
    res.status(500).json({ message: 'Failed to update department' });
  }
});

router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    await deleteDepartment(req, res);
  } catch (error) {
    console.error('Delete department error:', error);
    res.status(500).json({ message: 'Failed to delete department' });
  }
});

router.post('/:id/members', protect, authorize('admin'), [
  body('userId').notEmpty().withMessage('User ID is required'),
  validate
], async (req, res) => {
  try {
    await addMember(req, res);
  } catch (error) {
    console.error('Add member to department error:', error);
    res.status(500).json({ message: 'Failed to add member to department' });
  }
});

router.delete('/:id/members/:userId', protect, authorize('admin'), async (req, res) => {
  try {
    await removeMember(req, res);
  } catch (error) {
    console.error('Remove member from department error:', error);
    res.status(500).json({ message: 'Failed to remove member from department' });
  }
});

export default router;
