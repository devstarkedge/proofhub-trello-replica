import express from 'express';
import { protect } from '../../middleware/authMiddleware.js';
import { requireResourcePermission } from '../../middleware/requireAccessControl.js';
import { setup } from './attendance.controller.js';

const router = express.Router();
router.use(protect);

router.post('/setup', requireResourcePermission('attendance', 'manage_policy'), setup);

export default router;
