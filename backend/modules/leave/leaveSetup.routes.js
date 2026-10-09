import express from 'express';
import { protect } from '../../middleware/authMiddleware.js';
import { requireResourcePermission } from '../../middleware/requireAccessControl.js';
import { setup, getSetupStatus } from './leaveSetup.controller.js';

const router = express.Router();
router.use(protect);
router.get('/setup', getSetupStatus);

router.post('/setup', requireResourcePermission('leave', 'manage_policy'), setup);

export default router;
