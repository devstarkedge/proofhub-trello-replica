import express from 'express';
import { body } from 'express-validator';
import { protect } from '../../middleware/authMiddleware.js';
import { requireResourcePermission } from '../../middleware/requireAccessControl.js';
import { validate } from '../../middleware/validation.js';
import * as controller from './attendanceShift.controller.js';

const router = express.Router();
router.use(protect);
router.use(requireResourcePermission('attendance', 'manage_shifts'));

router.get('/shifts', controller.listShifts);
router.post(
  '/shifts',
  [body('name').trim().notEmpty(), body('startLocalTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/), body('endLocalTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/), validate],
  controller.createShift
);
router.patch('/shifts/:shiftId', controller.updateShift);
router.post('/shifts/:shiftId/deactivate', controller.deactivateShift);

router.get('/shift-assignments', controller.listShiftAssignments);
router.post(
  '/shift-assignments',
  [body('shiftId').notEmpty(), body('scope').isIn(['workspace', 'department', 'user']), validate],
  controller.createShiftAssignment
);
router.post('/shift-assignments/:assignmentId/remove', controller.removeShiftAssignment);

export default router;
