import express from 'express';
import { body } from 'express-validator';
import { register, login, getMe, updateDetails, updatePassword, refreshToken } from '../controllers/authController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';

const router = express.Router();

// Apply validation and error handling
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validate
], async (req, res) => {
  try {
    await register(req, res);
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Registration failed' });
  }
});

router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validate
], async (req, res) => {
  try {
    await login(req, res);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
});

router.get('/me', protect, async (req, res) => {
  try {
    await getMe(req, res);
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ message: 'Failed to get user details' });
  }
});

router.put('/updatedetails', protect, async (req, res) => {
  try {
    await updateDetails(req, res);
  } catch (error) {
    console.error('Update details error:', error);
    res.status(500).json({ message: 'Failed to update details' });
  }
});

router.put('/updatepassword', protect, async (req, res) => {
  try {
    await updatePassword(req, res);
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({ message: 'Failed to update password' });
  }
});

router.post('/refresh', protect, async (req, res) => {
  try {
    await refreshToken(req, res);
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ message: 'Failed to refresh token' });
  }
});

router.get('/verify', protect, async (req, res) => {
  try {
    await getMe(req, res);
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ message: 'Verification failed' });
  }
});

export default router;
