import { requireSuperAdmin } from '../middleware/requireSuperAdmin.js';
import express from 'express';
const router = express.Router();
import { updateAdminSettings, getSystemStats, forcePasswordChange } from '../controllers/adminController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

// All routes in this file are protected and for admins only
router.use(protect);

router.route('/settings').put(authorize('admin'), updateAdminSettings);
router.route('/stats').get(authorize('admin'), getSystemStats);
router.route('/force-password-change/:id').put(requireSuperAdmin, forcePasswordChange);

export default router;
