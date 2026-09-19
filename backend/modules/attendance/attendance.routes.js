import express from 'express';
import setupRoutes from './attendanceSetup.routes.js';
import selfRoutes from './attendanceSelf.routes.js';
import policyRoutes from './attendancePolicy.routes.js';
import shiftRoutes from './attendanceShift.routes.js';
import locationRoutes from './attendanceLocation.routes.js';
import wfhRoutes from './wfhRequest.routes.js';
import regularizationRoutes from './attendanceRegularization.routes.js';
import workModeOverrideRoutes from './attendanceWorkModeOverride.routes.js';

/**
 * Single mount point for the Attendance module —
 * `app.use('/api/attendance', attendanceRoutes)` in server.js. Each
 * sub-router applies its own `protect`/permission middleware internally,
 * matching leave.routes.js's convention (no global gate applied here).
 */
const router = express.Router();

router.use('/', setupRoutes);
router.use('/', selfRoutes);
router.use('/', policyRoutes);
router.use('/', shiftRoutes);
router.use('/', locationRoutes);
router.use('/', wfhRoutes);
router.use('/', regularizationRoutes);
router.use('/', workModeOverrideRoutes);

export default router;
