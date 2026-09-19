import express from 'express';
import { body } from 'express-validator';
import { protect } from '../../middleware/authMiddleware.js';
import { requireResourcePermission } from '../../middleware/requireAccessControl.js';
import { validate } from '../../middleware/validation.js';
import * as controller from './attendanceRegularization.controller.js';

const router = express.Router();
router.use(protect);

router.get('/regularizations/mine', controller.listMine);
router.post(
  '/regularizations',
  [body('workDateKey').notEmpty(), body('type').notEmpty(), validate],
  controller.submit
);
router.post('/regularizations/:requestId/cancel', controller.cancel);
router.get('/regularizations/:requestId/timeline', controller.timeline);

router.get('/regularizations/approvals/queue', requireResourcePermission('attendance', 'approve_regularization'), controller.listApprovalQueue);
router.post(
  '/regularizations/approvals/:approvalId/decide',
  requireResourcePermission('attendance', 'approve_regularization'),
  [body('decision').isIn(['APPROVED', 'REJECTED']), validate],
  controller.decide
);

router.post(
  '/manual-correction',
  requireResourcePermission('attendance', 'correct_attendance'),
  [body('targetUserId').notEmpty(), body('workDateKey').notEmpty(), body('type').notEmpty(), body('correction').isObject(), body('reason').trim().notEmpty(), validate],
  controller.manualCorrection
);

export default router;
