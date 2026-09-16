import express from 'express';
import { protect } from '../../middleware/authMiddleware.js';
import { requireResourcePermission } from '../../middleware/requireAccessControl.js';
import * as controller from './leaveDashboard.controller.js';

const router = express.Router();
router.use(protect);

// The single check the frontend must use to decide whether to show the
// Leave Dashboard at all and which section to render — see
// leaveAuthorization.service.js#getLeaveDashboardScope. Open to any
// authenticated member; it only reports what THEY are entitled to see.
router.get('/scope', controller.getDashboardScope);

// /employee always self-scopes to the caller — every member may see their
// own leave data regardless of dashboard scope, so no extra gate is needed
// (and none should be added here).
router.get('/employee', controller.getEmployeeDashboard);

// /manager is department-scoped by construction (getManagedDepartmentIds
// derives the department list server-side from Department.managers, never
// from a client-supplied id), but a caller with NO managed department and
// no workspace-view grant must be rejected outright rather than silently
// served an empty-but-200 response — requireLeaveDashboardAccess enforces
// that so a direct API call can't bypass the UI redirect.
router.get('/manager', controller.requireLeaveDashboardAccess, controller.getManagerDashboard);

// /hr and /admin return every employee's workspace-wide pending approvals
// and summary counts unconditionally — a real administrative view, not a
// caller-scoped subset, so it must be gated the same way Sales/Finance
// gate their own workspace-wide views. Admin and HR get this automatically
// (permissionEngine's Admin/HR-full-Leave-access rule); a custom role needs
// an explicit leave:view_workspace grant.
router.get('/hr', requireResourcePermission('leave', 'view_workspace'), controller.getHrDashboard);
router.get('/admin', requireResourcePermission('leave', 'view_workspace'), controller.getAdminDashboard);
router.get('/day-status', controller.getDayStatus);

export default router;
