import express from 'express';
import { body } from 'express-validator';
import { getUsers, getUser, updateUser, deleteUser, getProfile, updateProfile } from '../controllers/userController.js';
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

router.get('/', protect, authorize('admin'), async (req, res) => {
  try {
    await getUsers(req, res);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Failed to get users' });
  }
});

router.get('/profile', protect, async (req, res) => {
  try {
    await getProfile(req, res);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Failed to get profile' });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    await getUser(req, res);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Failed to get user' });
  }
});

router.put('/profile', protect, [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('email').optional().isEmail().withMessage('Valid email is required'),
  validate
], async (req, res) => {
  try {
    await updateProfile(req, res);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

router.put('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    await updateUser(req, res);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Failed to update user' });
  }
});

router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    await deleteUser(req, res);
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

export default router;
