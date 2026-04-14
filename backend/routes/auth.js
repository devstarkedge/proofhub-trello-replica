import express from 'express';
import { body } from 'express-validator';
import { register, login, getMe, updateDetails, updatePassword, refreshToken, adminCreateUser, checkEmail, forgotPassword, verifyResetToken, resetPassword } from '../controllers/authController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';
import { rateLimiter } from '../middleware/rateLimiter.js';

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

// Forgot password (public, strict rate limit)
router.post('/forgot-password', rateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 5, message: 'Too many password reset requests. Please try again later.' }), [
  body('email').isEmail().withMessage('Valid email is required'),
  validate
], forgotPassword);

// Verify reset token (public)
router.get('/verify-reset-token/:token', rateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 10, message: 'Too many requests. Please try again later.' }), verifyResetToken);

// Reset password (public)
router.post('/reset-password/:token', rateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 10, message: 'Too many requests. Please try again later.' }), [
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validate
], resetPassword);

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
