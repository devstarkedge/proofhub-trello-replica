import express from 'express';
import { body } from 'express-validator';
import { protect } from '../../middleware/authMiddleware.js';
import { requireResourcePermission } from '../../middleware/requireAccessControl.js';
import { validate } from '../../middleware/validation.js';
import * as controller from './attendanceShift.controller.js';

const router = express.Router();
router.use(protect);
const gate = requireResourcePermission('attendance', 'manage_shifts');

router.get('/shifts', gate, controller.listShifts);
router.post('/shifts', gate,
  [body('name').trim().notEmpty(), body('startLocalTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/), body('endLocalTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/), validate],
  controller.createShift
);
router.patch('/shifts/:shiftId', gate, controller.updateShift);
router.post('/shifts/:shiftId/deactivate', gate, controller.deactivateShift);

router.get('/shift-assignments', gate, controller.listShiftAssignments);
router.post('/shift-assignments', gate,
  [body('shiftId').notEmpty(), body('scope').isIn(['workspace', 'department', 'user']), validate],
  controller.createShiftAssignment
);
router.post('/shift-assignments/:assignmentId/remove', gate, controller.removeShiftAssignment);

export default router;
