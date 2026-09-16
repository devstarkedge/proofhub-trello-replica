import express from 'express';
import { protect } from '../../middleware/authMiddleware.js';
import { requireResourcePermission } from '../../middleware/requireAccessControl.js';
import * as controller from './leaveReport.controller.js';
import { getAuditLog } from './leaveAudit.controller.js';

const router = express.Router();
router.use(protect);

// Self/department visibility is enforced inside the controller (mirrors
// leaveAuthorization.service.js's rules) — not gated here.
router.get('/usage/employee/:userId?', controller.getEmployeeUsageReport);
router.get('/usage/department', controller.getDepartmentUsageReport);

// Pure workspace-wide aggregates with no legitimate self/department
// narrowing — Admin-always or HR-with-explicit-grant only.
router.get('/trends', requireResourcePermission('leave', 'view_reports'), controller.getMonthlyTrends);
router.get('/approval-turnaround', requireResourcePermission('leave', 'view_reports'), controller.getApprovalTurnaround);
router.get('/audit-log', requireResourcePermission('leave', 'view_audit'), getAuditLog);

export default router;
