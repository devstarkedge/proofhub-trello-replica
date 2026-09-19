import express from 'express';
import { body } from 'express-validator';
import { protect } from '../../middleware/authMiddleware.js';
import { requireResourcePermission } from '../../middleware/requireAccessControl.js';
import { validate } from '../../middleware/validation.js';
import * as controller from './attendanceWorkModeOverride.controller.js';

const router = express.Router();
router.use(protect);
router.use(requireResourcePermission('attendance', 'manage_work_modes'));

router.get('/work-mode-overrides', controller.list);
router.get('/work-mode-overrides/history', controller.history);
router.post(
  '/work-mode-overrides',
  [
    body('scopeType').isIn(['ROLE', 'DEPARTMENT', 'USER']),
    body('scopeId').notEmpty(),
    body('allowedModes').isArray({ min: 1 }),
    body('defaultMode').isIn(['OFFICE', 'WFH', 'HYBRID', 'FIELD']),
    body('effectiveFrom').notEmpty(),
    validate
  ],
  controller.create
);
router.patch('/work-mode-overrides/:overrideId', controller.update);
router.post('/work-mode-overrides/:overrideId/deactivate', controller.deactivate);

export default router;
