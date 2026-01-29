import express from 'express';
import { getSalesPermission, setSalesPermission } from '../controllers/salesPermissionController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Admin only endpoints
router.get('/:id', protect, authorize('admin'), getSalesPermission);
router.put('/:id', protect, authorize('admin'), setSalesPermission);

export default router;
