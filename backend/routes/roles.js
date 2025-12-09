import express from 'express';
import { body } from 'express-validator';
import {
  getRoles,
  getRole,
  getRoleBySlug,
  createRole,
  updateRole,
  deleteRole,
  getPermissionDefinitions,
  getMyPermissions,
  initializeRoles
} from '../controllers/roleController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';

const router = express.Router();

// Public routes (authenticated users)
router.get('/my-permissions', protect, getMyPermissions);

// Get all roles (authenticated users can see roles for dropdown)
router.get('/', protect, getRoles);

// Get permission definitions (admin only)
router.get('/permissions/definitions', protect, authorize('admin'), getPermissionDefinitions);

// Get role by slug
router.get('/slug/:slug', protect, getRoleBySlug);

// Get single role
router.get('/:id', protect, getRole);

// Admin-only routes
router.post('/', protect, authorize('admin'), [
  body('name')
    .trim()
    .notEmpty().withMessage('Role name is required')
    .isLength({ max: 50 }).withMessage('Role name cannot exceed 50 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Description cannot exceed 200 characters'),
  body('permissions')
    .optional()
    .isObject().withMessage('Permissions must be an object'),
  validate
], createRole);

router.put('/:id', protect, authorize('admin'), [
  body('name')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('Role name cannot exceed 50 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Description cannot exceed 200 characters'),
  body('permissions')
    .optional()
    .isObject().withMessage('Permissions must be an object'),
  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive must be a boolean'),
  validate
], updateRole);

router.delete('/:id', protect, authorize('admin'), deleteRole);

// Initialize/seed default roles (admin only)
router.post('/init', protect, authorize('admin'), initializeRoles);

export default router;
