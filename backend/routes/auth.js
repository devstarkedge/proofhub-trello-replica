import express from 'express';
import { body } from 'express-validator';
import { register, login, getMe, updateDetails, updatePassword, refreshToken, checkEmail, forgotPassword, verifyResetToken, resetPassword, registerAndCreateWorkspace } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';
import { rateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.post('/register', rateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 5, message: 'Too many registration attempts. Please try again later.' }), [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validate
], register);

// Combined register + create workspace (for public "Create Workspace" CTA)
router.post('/register-workspace', rateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 5, message: 'Too many workspace creation requests. Please try again later.' }), [
  body('name').trim().notEmpty().withMessage('Full name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('workspaceName').trim().notEmpty().withMessage('Workspace name is required'),
  body('workspaceType').trim().notEmpty().withMessage('Workspace type is required'),
  validate
], registerAndCreateWorkspace);

router.post('/login', rateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 10, message: 'Too many login attempts. Please try again later.' }), [
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

// /admin-create-user was retired — see authController.js's note near where
// adminCreateUser used to be defined.

router.get('/me', protect, getMe);
router.put('/updatedetails', protect, updateDetails);
router.put('/updatepassword', protect, updatePassword);
router.post('/refresh', protect, refreshToken);
router.get('/verify', protect, getMe);

export default router;
