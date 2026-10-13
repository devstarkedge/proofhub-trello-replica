import express from 'express';
import { body } from 'express-validator';
import { protect } from '../../middleware/authMiddleware.js';
import { requireResourcePermission } from '../../middleware/requireAccessControl.js';
import { validate } from '../../middleware/validation.js';
import * as controller from './leaveApproval.controller.js';

const router = express.Router();
router.use(protect);

// The service validates assigned candidates, current membership and view
// scope, current organizational or explicitly delegated stage authority,
// sequential ordering and self-approval restrictions for every decision.
router.get('/queue', controller.getApprovalQueue);
router.post(
  '/:approvalId/decide',
  [body('decision').isIn(['APPROVED', 'REJECTED']), validate],
  controller.decideApproval
);
router.get('/requests/:requestId/timeline', controller.getApprovalTimeline);

// HR/Admin-only: reviewing an employee's cancellation request, or directly
// cancelling an already-approved leave (spec's "HR cancels on the day"
// flow) — administrative actions, gated by the leave.cancel_approved
// permission.
router.post(
  '/requests/:requestId/cancellation-decision',
  requireResourcePermission('leave', 'cancel_approved'),
  [body('decision').isIn(['approved', 'rejected']), validate],
  controller.decideCancellationRequest
);
router.post(
  '/requests/:requestId/hr-cancel',
  requireResourcePermission('leave', 'cancel_approved'),
  [body('reason').trim().notEmpty(), validate],
  controller.cancelApprovedLeave
);

export default router;
