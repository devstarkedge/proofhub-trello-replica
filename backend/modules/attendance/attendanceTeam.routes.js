import express from 'express';
import asyncHandler from '../../middleware/asyncHandler.js';
import { getTeamAttendance, getTeamAttendanceMonth, getTeamAttendanceDay, exportTeamAttendance } from './attendanceTeam.service.js';

const router = express.Router();
const args = req => ({ viewer: req.user, workspaceId: req.workspaceId, query: req.query, ...req.params });
// Mounted behind the existing Attendance authentication/module guards. Scope is
// resolved for every request, including detail reads and CSV exports.
router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.get('/', asyncHandler(async (req, res) => res.json({ success: true, data: await getTeamAttendance(args(req)) })));
router.get('/export', asyncHandler(async (req, res) => exportTeamAttendance(args(req), res)));
router.get('/users/:userId/months/:month', asyncHandler(async (req, res) => res.json({ success: true, data: await getTeamAttendanceMonth(args(req)) })));
router.get('/users/:userId/days/:workDateKey', asyncHandler(async (req, res) => res.json({ success: true, data: await getTeamAttendanceDay(args(req)) })));
export default router;
