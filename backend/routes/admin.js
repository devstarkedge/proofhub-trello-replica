import express from 'express';
const router = express.Router();
import { updateAdminSettings, getSystemStats, forcePasswordChange } from '../controllers/adminController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

// All routes in this file are protected and for admins only
router.use(protect, authorize('admin'));

router.route('/settings').put(updateAdminSettings);
router.route('/stats').get(getSystemStats);
router.route('/force-password-change/:id').put(forcePasswordChange);

export default router;
