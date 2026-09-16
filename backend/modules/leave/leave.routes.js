import express from 'express';
import setupRoutes from './leaveSetup.routes.js';
import policyRoutes from './leavePolicy.routes.js';
import calendarRoutes from './leaveCalendar.routes.js';
import requestRoutes from './leaveRequest.routes.js';
import approvalRoutes from './leaveApproval.routes.js';
import dashboardRoutes from './leaveDashboard.routes.js';
import reportRoutes from './leaveReport.routes.js';
import adjustmentRoutes from './leaveAdjustment.routes.js';

/**
 * Single mount point for the Leave module — `app.use('/api/leave', leaveRoutes)`
 * in server.js. Each sub-router applies its own `protect`/permission
 * middleware internally, matching the rest of this codebase's convention
 * (no global gate applied here).
 */
const router = express.Router();

router.use('/', setupRoutes);
router.use('/', policyRoutes);
router.use('/', calendarRoutes);
router.use('/', requestRoutes);
router.use('/approvals', approvalRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportRoutes);
router.use('/adjustments', adjustmentRoutes);

export default router;
