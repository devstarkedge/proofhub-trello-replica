import mongoose from 'mongoose';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import Plan from '../models/Plan.js';
import { changeSubscription } from '../modules/superAdmin/subscriptionService.js';
import * as entitlementService from '../modules/plans/entitlementService.js';

// @desc    List assignable plan tiers, for the assignment dropdown
// @route   GET /api/super-admin/plans
// @access  Super Admin only
export const getPlans = asyncHandler(async (req, res) => {
  const plans = await Plan.find({ isActive: true, isAssignableToNew: true }).sort({ sortOrder: 1 }).lean();
  res.status(200).json({ success: true, data: plans });
});

// @desc    Change a workspace's plan/billing cycle/status/notes ("Change
//          Plan"). Validated server-side — never trust planId/workspaceId
//          from the frontend alone: the target plan must exist and still be
//          active (a retired tier like Legacy/Business can never be
//          (re)assigned even via a direct API call, not just hidden from
//          the dropdown), and the workspace's current member count must fit
//          inside the target plan's limit (downgrade protection).
// @route   PATCH /api/super-admin/workspaces/:id/billing
// @access  Super Admin only
export const patchBilling = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new ErrorResponse('Invalid workspace id', 400));
  }
  const { planId, billingCycle, status, notes, customMemberLimit } = req.body;
  if (!planId || !mongoose.Types.ObjectId.isValid(planId)) {
    return next(new ErrorResponse('A valid planId is required', 400));
  }

  const targetPlan = await Plan.findById(planId).lean();
  if (!targetPlan) {
    return next(new ErrorResponse('Plan not found', 404));
  }
  if (!targetPlan.isActive) {
    return next(new ErrorResponse(`The ${targetPlan.name} plan has been retired and can no longer be assigned.`, 400));
  }

  // Enterprise has no shared/global member limit — every Enterprise
  // workspace is individually provisioned with its own cap, so a Member
  // Limit is a required field whenever the target plan is Enterprise (never
  // silently defaulted to "unlimited" or any hardcoded number).
  let resolvedCustomMemberLimit;
  if (targetPlan.slug === 'enterprise') {
    const parsedLimit = Number(customMemberLimit);
    if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
      return next(new ErrorResponse('Member Limit is required for the Enterprise plan and must be a positive whole number.', 400));
    }
    resolvedCustomMemberLimit = parsedLimit;
  }

  // Downgrade protection — a workspace can never be moved onto a plan whose
  // member limit it already exceeds. For Enterprise this checks against the
  // limit just entered above, not any shared Plan.memberLimit (which is
  // always null for Enterprise).
  await entitlementService.assertMemberCountFitsPlan(id, targetPlan, {
    targetMemberLimit: targetPlan.slug === 'enterprise' ? resolvedCustomMemberLimit : undefined,
  });

  const subscription = await changeSubscription({
    workspaceId: id,
    planId,
    billingCycle,
    status,
    notes,
    customMemberLimit: resolvedCustomMemberLimit,
    actor: req.user
  });

  res.status(200).json({ success: true, data: subscription });
});
