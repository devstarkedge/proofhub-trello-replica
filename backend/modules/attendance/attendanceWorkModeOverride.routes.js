import express from 'express';
import { body } from 'express-validator';
import { protect } from '../../middleware/authMiddleware.js';
import { requireResourcePermission } from '../../middleware/requireAccessControl.js';
import { validate } from '../../middleware/validation.js';
import * as controller from './attendanceWorkModeOverride.controller.js';

const router = express.Router();
router.use(protect);
const gate = requireResourcePermission('attendance', 'manage_work_modes');

router.get('/work-mode-overrides', gate, controller.list);
router.get('/work-mode-overrides/history', gate, controller.history);
router.post('/work-mode-overrides', gate,
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
router.patch('/work-mode-overrides/:overrideId', gate, controller.update);
router.post('/work-mode-overrides/:overrideId/deactivate', gate, controller.deactivate);

router.get('/work-mode-overrides/:overrideId/rules', gate, controller.listRules);
router.post('/work-mode-overrides/:overrideId/rules', gate,
  [
    body('dayOfWeek').isInt({ min: 0, max: 6 }),
    body('occurrence').optional().isIn(['EVERY', 'FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'LAST']),
    body('mode').isIn(['OFFICE', 'WFH', 'HYBRID', 'FIELD']),
    validate
  ],
  controller.createRule
);
router.post('/work-mode-overrides/rules/:ruleId/deactivate', gate, controller.deactivateRule);

router.get('/work-mode-overrides/:overrideId/date-overrides', gate, controller.listDateOverridesForOverride);
router.post('/work-mode-overrides/:overrideId/date-overrides', gate,
  [body('startDate').notEmpty(), body('mode').isIn(['OFFICE', 'WFH', 'HYBRID', 'FIELD']), validate],
  controller.createDateOverridesForOverride
);
router.post('/work-mode-overrides/date-overrides/:dateOverrideId/deactivate', gate, controller.deactivateDateOverrideForOverride);

export default router;
