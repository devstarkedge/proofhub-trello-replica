import express from 'express';
import { body } from 'express-validator';
import { protect } from '../../middleware/authMiddleware.js';
import { requireResourcePermission } from '../../middleware/requireAccessControl.js';
import { validate } from '../../middleware/validation.js';
import * as controller from './attendancePolicy.controller.js';

const router = express.Router();
router.use(protect);

router.get('/policy', requireResourcePermission('attendance', 'manage_policy'), controller.getPolicyConfig);
router.post(
  '/policy',
  requireResourcePermission('attendance', 'manage_policy'),
  [body('name').trim().notEmpty(), body('effectiveDate').notEmpty(), body('content').isObject(), validate],
  controller.createPolicy
);
router.patch('/policy/:policyId', requireResourcePermission('attendance', 'manage_policy'), controller.editPolicy);
router.post('/policy/:policyId/activate', requireResourcePermission('attendance', 'manage_policy'), controller.activatePolicy);
router.post('/policy/:policyId/archive', requireResourcePermission('attendance', 'manage_policy'), controller.archivePolicy);

export default router;
