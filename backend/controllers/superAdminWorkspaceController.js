import mongoose from 'mongoose';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import {
  listWorkspaces,
  getWorkspaceOverview,
  getWorkspaceMembers,
  getWorkspaceProjects,
  getWorkspaceUsage,
  getWorkspaceActivity
} from '../modules/superAdmin/workspaceStatsService.js';
import { changeWorkspaceStatus } from '../modules/superAdmin/workspaceStatusService.js';
import WorkspaceSubscription from '../models/WorkspaceSubscription.js';

function requireValidWorkspaceId(req, next) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    next(new ErrorResponse('Invalid workspace id', 400));
    return false;
  }
  return true;
}

// @desc    Cursor-paginated, searchable, filterable workspace list
// @route   GET /api/super-admin/workspaces
// @access  Super Admin only
export const getWorkspaces = asyncHandler(async (req, res) => {
  const { cursor, limit, search, status, plan, type, sort } = req.query;
  const result = await listWorkspaces({ cursor, limit, search, status, planSlug: plan, type, sort });
  res.status(200).json({ success: true, ...result });
});

// @desc    One workspace's Overview tab
// @route   GET /api/super-admin/workspaces/:id
// @access  Super Admin only
export const getWorkspace = asyncHandler(async (req, res, next) => {
  if (!requireValidWorkspaceId(req, next)) return;
  const data = await getWorkspaceOverview(req.params.id);
  if (!data) return next(new ErrorResponse('Workspace not found', 404));
  res.status(200).json({ success: true, data });
});

// @desc    Members tab
// @route   GET /api/super-admin/workspaces/:id/members
// @access  Super Admin only
export const getMembers = asyncHandler(async (req, res, next) => {
  if (!requireValidWorkspaceId(req, next)) return;
  const data = await getWorkspaceMembers(req.params.id);
  res.status(200).json({ success: true, data });
});

// @desc    Projects tab
// @route   GET /api/super-admin/workspaces/:id/projects
// @access  Super Admin only
export const getProjects = asyncHandler(async (req, res, next) => {
  if (!requireValidWorkspaceId(req, next)) return;
  const data = await getWorkspaceProjects(req.params.id);
  res.status(200).json({ success: true, data });
});

// @desc    Usage tab
// @route   GET /api/super-admin/workspaces/:id/usage
// @access  Super Admin only
export const getUsage = asyncHandler(async (req, res, next) => {
  if (!requireValidWorkspaceId(req, next)) return;
  const data = await getWorkspaceUsage(req.params.id);
  res.status(200).json({ success: true, data });
});

// @desc    Plan & Billing tab
// @route   GET /api/super-admin/workspaces/:id/billing
// @access  Super Admin only
export const getBilling = asyncHandler(async (req, res, next) => {
  if (!requireValidWorkspaceId(req, next)) return;
  const subscription = await WorkspaceSubscription.findOne({ workspace: req.params.id }).populate('plan').lean();
  res.status(200).json({ success: true, data: subscription });
});

// @desc    Activity tab (recent — Activity retains 90 days only)
// @route   GET /api/super-admin/workspaces/:id/activity
// @access  Super Admin only
export const getActivity = asyncHandler(async (req, res, next) => {
  if (!requireValidWorkspaceId(req, next)) return;
  const data = await getWorkspaceActivity(req.params.id);
  res.status(200).json({ success: true, data: data.activity, meta: { note: data.note } });
});

// @desc    Suspend / Reactivate / Archive / Restore a workspace
// @route   PATCH /api/super-admin/workspaces/:id/status
// @access  Super Admin only
export const patchStatus = asyncHandler(async (req, res, next) => {
  if (!requireValidWorkspaceId(req, next)) return;
  const { status, reason } = req.body;

  const workspace = await changeWorkspaceStatus({
    workspaceId: req.params.id,
    newStatus: status,
    reason,
    actor: req.user,
    meta: { ip: req.ip, userAgent: req.headers['user-agent'] }
  });

  res.status(200).json({
    success: true,
    data: {
      _id: workspace._id,
      status: workspace.status,
      isActive: workspace.isActive,
      statusReason: workspace.statusReason,
      statusChangedAt: workspace.statusChangedAt
    }
  });
});
