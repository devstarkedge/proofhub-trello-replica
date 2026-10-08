import express from 'express';
import { body } from 'express-validator';
import { protect } from '../../middleware/authMiddleware.js';
import { requireResourcePermission } from '../../middleware/requireAccessControl.js';
import { validate } from '../../middleware/validation.js';
import * as controller from './attendanceOfficeHoursOverride.controller.js';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const router = express.Router();
router.use(protect);
const gate = requireResourcePermission('attendance', 'manage_office_hours');

router.get('/office-hours-overrides', gate, controller.list);
router.get('/office-hours-overrides/history', gate, controller.history);
router.post('/office-hours-overrides', gate,
  [
    body('scopeType').isIn(['ROLE', 'DEPARTMENT', 'USER']),
    body('scopeId').notEmpty(),
    body('startLocalTime').optional({ nullable: true }).matches(TIME_PATTERN),
    body('endLocalTime').optional({ nullable: true }).matches(TIME_PATTERN),
    body('graceMinutes').optional({ nullable: true }).isInt({ min: 0 }),
    body('earlyExitGraceMinutes').optional({ nullable: true }).isInt({ min: 0 }),
    body('minimumFullDayMinutes').optional({ nullable: true }).isInt({ min: 1 }),
    body('minimumHalfDayMinutes').optional({ nullable: true }).isInt({ min: 1 }),
    body('effectiveFrom').notEmpty(),
    validate
  ],
  controller.create
);
router.patch('/office-hours-overrides/:overrideId', gate, controller.update);
router.post('/office-hours-overrides/:overrideId/deactivate', gate, controller.deactivate);

export default router;
