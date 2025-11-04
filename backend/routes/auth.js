import express from 'express';
import { body } from 'express-validator';
import { register, login, getMe, updateDetails, updatePassword, refreshToken, adminCreateUser } from '../controllers/authController.js';
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

router.post('/admin-create-user', protect, authorize('admin'), [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['admin', 'manager', 'hr', 'employee']).withMessage('Invalid role'),
  validate
], adminCreateUser);

router.get('/me', protect, getMe);
router.put('/updatedetails', protect, updateDetails);
router.put('/updatepassword', protect, updatePassword);
router.post('/refresh', protect, refreshToken);
router.get('/verify', protect, getMe);

export default router;
