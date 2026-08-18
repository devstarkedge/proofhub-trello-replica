import mongoose from 'mongoose';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import Plan from '../models/Plan.js';
import { changeSubscription } from '../modules/superAdmin/subscriptionService.js';

// @desc    List assignable plan tiers, for the assignment dropdown
// @route   GET /api/super-admin/plans
// @access  Super Admin only
export const getPlans = asyncHandler(async (req, res) => {
  const plans = await Plan.find({ isActive: true, isAssignableToNew: true }).sort({ sortOrder: 1 }).lean();
  res.status(200).json({ success: true, data: plans });
});

// @desc    Change a workspace's plan/billing cycle/status/notes
// @route   PATCH /api/super-admin/workspaces/:id/billing
// @access  Super Admin only
export const patchBilling = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new ErrorResponse('Invalid workspace id', 400));
  }
  const { planId, billingCycle, status, notes } = req.body;
  if (!planId || !mongoose.Types.ObjectId.isValid(planId)) {
    return next(new ErrorResponse('A valid planId is required', 400));
  }

  const subscription = await changeSubscription({
    workspaceId: id,
    planId,
    billingCycle,
    status,
    notes,
    actor: req.user
  });

  res.status(200).json({ success: true, data: subscription });
});
