import express from 'express';
import { body } from 'express-validator';
import { protect } from '../../middleware/authMiddleware.js';
import { validate } from '../../middleware/validation.js';
import { rateLimiter } from '../../middleware/rateLimiter.js';
import { getMyTodayStatus, postCheckIn, postCheckOut } from './attendance.controller.js';

const router = express.Router();
router.use(protect);

// Keyed by user id (not bare IP) so it can't be defeated by switching
// networks and can't collide with unrelated routes sharing this factory —
// generous enough to never punish a legitimate retry after a dropped
// response (spec §86); auth + the active-session/idempotency-key
// constraints remain the actual correctness mechanism, this is only abuse
// protection.
const checkInOutLimiter = rateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 30, keyFn: (req) => req.user?.id, message: 'Too many attendance requests — please wait a moment and try again.' });

// No requireResourcePermission gate here — every workspace member may act
// on THEIR OWN attendance; whether they're actually required to (Admin
// never is) is decided server-side by attendance.service.js's eligibility
// check, never by a route-level permission gate standing in for it.
router.get('/me/today', getMyTodayStatus);
router.post(
  '/check-in',
  checkInOutLimiter,
  [
    body('coordinates').optional().isArray({ min: 2, max: 2 }),
    body('reportedAccuracyMeters').optional().isNumeric(),
    body('requestedWorkMode').optional().isIn(['OFFICE', 'WFH', 'HYBRID', 'FIELD']),
    validate
  ],
  postCheckIn
);
router.post(
  '/check-out',
  checkInOutLimiter,
  [body('coordinates').optional().isArray({ min: 2, max: 2 }), body('reportedAccuracyMeters').optional().isNumeric(), validate],
  postCheckOut
);

export default router;
