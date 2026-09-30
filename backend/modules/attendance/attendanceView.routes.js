import express from 'express';
import { protect } from '../../middleware/authMiddleware.js';
import { getAccess, getView, getDashboard, getSessionDetail } from './attendanceView.controller.js';

/**
 * The centralized Attendance visibility API (new spec §9, §24) — no
 * requireResourcePermission gate here: authorization is per-record and
 * scope-dependent (Admin/HR/manager/self/custom-role), resolved entirely
 * inside attendanceAuthorization.service.js, not a flat route-level
 * boolean. Every handler enforces its own scope before touching data.
 */
const router = express.Router();
router.use(protect);

router.get('/access', getAccess);
router.get('/view', getView);
router.get('/dashboard', getDashboard);
router.get('/sessions/:sessionId', getSessionDetail);

export default router;
