import express from 'express';
import { protect } from '../../middleware/authMiddleware.js';
import { requireResourcePermission } from '../../middleware/requireAccessControl.js';
import * as controller from './leaveDashboard.controller.js';

const router = express.Router();
router.use(protect);

// /employee and /manager self-scope to the caller (a manager dashboard for
// someone who manages zero departments simply returns empty team sections,
// never another workspace member's private data) — no extra gate needed.
router.get('/employee', controller.getEmployeeDashboard);
router.get('/manager', controller.getManagerDashboard);

// /hr and /admin return every employee's workspace-wide pending approvals
// and summary counts unconditionally — a real administrative view, not a
// caller-scoped subset, so it must be gated the same way Sales/Finance
// gate their own workspace-wide views. Admin gets this automatically
// (permissionEngine's Admin-full-access rule); HR needs an explicit grant.
router.get('/hr', requireResourcePermission('leave', 'view_workspace'), controller.getHrDashboard);
router.get('/admin', requireResourcePermission('leave', 'view_workspace'), controller.getAdminDashboard);
router.get('/day-status', controller.getDayStatus);

export default router;
