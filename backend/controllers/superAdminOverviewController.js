import asyncHandler from '../middleware/asyncHandler.js';
import { getOverviewStats } from '../modules/superAdmin/workspaceStatsService.js';

// @desc    Platform-wide KPIs for the Super Admin Dashboard overview
// @route   GET /api/super-admin/overview
// @access  Super Admin only
export const getOverview = asyncHandler(async (req, res) => {
  const stats = await getOverviewStats();
  res.status(200).json({ success: true, data: stats });
});
