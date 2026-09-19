import express from 'express';
import { body } from 'express-validator';
import { protect } from '../../middleware/authMiddleware.js';
import { requireResourcePermission } from '../../middleware/requireAccessControl.js';
import { validate } from '../../middleware/validation.js';
import * as controller from './wfhRequest.controller.js';

const router = express.Router();
router.use(protect);

// Self-service — every member may request/view/cancel their OWN WFH
// requests; whether WFH is even enabled for them is a policy/eligibility
// decision made inside the service, never a route-level permission gate.
router.get('/wfh/mine', controller.listMine);
router.post(
  '/wfh',
  [body('startDate').notEmpty(), body('endDate').notEmpty(), validate],
  controller.submit
);
router.post('/wfh/:requestId/cancel', controller.cancel);
router.get('/wfh/:requestId/timeline', controller.timeline);

// Approval — gated behind the dedicated permission, same as Leave's own approval routes.
router.get('/wfh/approvals/queue', requireResourcePermission('attendance', 'approve_wfh'), controller.listApprovalQueue);
router.post(
  '/wfh/approvals/:approvalId/decide',
  requireResourcePermission('attendance', 'approve_wfh'),
  [body('decision').isIn(['APPROVED', 'REJECTED']), validate],
  controller.decide
);

export default router;
