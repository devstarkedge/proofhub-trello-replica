import express from 'express';
import { body } from 'express-validator';
import { register, login, getMe, updateDetails, updatePassword, refreshToken, adminCreateUser, checkEmail } from '../controllers/authController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';

const router = express.Router();

router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validate
], register);

router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validate
], login);

// Email uniqueness check (public)
router.post('/check-email', [
  body('email').isEmail().withMessage('Valid email is required'),
  validate
], checkEmail);

router.post('/admin-create-user', protect, authorize('admin'), [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').trim().notEmpty().withMessage('Role is required'),
  validate
], adminCreateUser);

router.get('/me', protect, getMe);
router.put('/updatedetails', protect, updateDetails);
router.put('/updatepassword', protect, updatePassword);
router.post('/refresh', protect, refreshToken);
router.get('/verify', protect, getMe);

export default router;
