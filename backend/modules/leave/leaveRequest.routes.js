import express from 'express';
import { body } from 'express-validator';
import { protect } from '../../middleware/authMiddleware.js';
import { validate } from '../../middleware/validation.js';
import * as requestController from './leaveRequest.controller.js';
import * as balanceController from './leaveBalance.controller.js';

const router = express.Router();
router.use(protect);

// Self-service actions — deliberately not gated by requireResourcePermission.
// Every employee may view their own balance/requests and submit/cancel
// their own leave; authorization for viewing SOMEONE ELSE's data is
// enforced inside the controller via canViewUserLeaveData (structural,
// derived from Department.managers / role, not the AccessOverride grant
// system — see leaveAuthorization.service.js). The one exception — Admin
// is blocked from every route below, since it all acts on/returns the
// CALLER's own data — is enforced inside each controller via
// assertMyLeaveSelfServiceAllowed, not here, so it stays in one
// consistent layer alongside the other-user checks these same controllers
// already do (getUserBalance, getUserRequests, getRequestDetail).
router.get('/balance/me', balanceController.getMyBalance);
router.get('/balance/:userId', balanceController.getUserBalance);

router.get('/requests/mine', requestController.getMyRequests);
router.get('/requests/user/:userId', requestController.getUserRequests);
router.get('/requests/:requestId', requestController.getRequestDetail);
router.post(
  '/requests',
  [
    body('leaveTypeId').notEmpty(),
    body('startDate').notEmpty(),
    body('endDate').notEmpty(),
    // No default is applied here or in the service — the caller must
    // resolve exactly one concrete shape, including which half for a
    // half-day request. See leaveRequest.validation.js#assertValidDayType.
    body('dayType').notEmpty().isIn(['FULL_DAY', 'HALF_DAY_FIRST_HALF', 'HALF_DAY_SECOND_HALF', 'SHORT_LEAVE']),
    validate
  ],
  requestController.submitRequest
);
router.post('/requests/:requestId/cancel', requestController.cancelPendingRequest);
router.post(
  '/requests/:requestId/request-cancellation',
  [body('reason').optional().trim(), validate],
  requestController.requestCancellation
);

export default router;
