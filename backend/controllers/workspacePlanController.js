import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import Workspace from '../models/Workspace.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import Plan from '../models/Plan.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import * as entitlementService from '../modules/plans/entitlementService.js';
import { isSelfServeTransitionAllowed, nextDisplayPlanSlug } from '../modules/plans/planRules.js';
import { changeSubscription } from '../modules/superAdmin/subscriptionService.js';

async function loadWorkspaceForOwner(req, next) {
  const workspace = await workspaceContext.runUnscoped(async () => Workspace.findById(req.params.id));
  if (!workspace) {
    next(new ErrorResponse('Workspace not found', 404));
    return null;
  }
  if (String(workspace.owner) !== String(req.user.id)) {
    next(new ErrorResponse('Only the workspace owner can view or manage Plan & Billing', 403));
    return null;
  }
  return workspace;
}

/**
 * Builds the `nextPlan` preview shown in the Plan & Billing UI — read from
 * the real Plan catalog, never a hardcoded frontend constant, so the
 * numbers stay correct if the catalog ever changes. `selfServe` tells the
 * frontend whether this preview is reachable via the confirmation-modal
 * upgrade flow (free -> pro) or only via Contact Sales (pro -> enterprise).
 */
async function buildNextPlanPreview(currentPlanSlug) {
  const nextSlug = nextDisplayPlanSlug(currentPlanSlug);
  if (!nextSlug) return null;

  const nextPlanDoc = await Plan.findOne({ slug: nextSlug, isActive: true }).lean();
  if (!nextPlanDoc) return null;

  return {
    slug: nextPlanDoc.slug,
    name: nextPlanDoc.name,
    memberLimit: nextPlanDoc.memberLimit,
    chatEnabled: nextPlanDoc.slug !== 'free',
    selfServe: isSelfServeTransitionAllowed(currentPlanSlug, nextSlug),
  };
}

// @desc    This workspace's current plan/entitlements — the Plan & Billing
//          section in Workspace Settings. Owner-only: this is sensitive
//          plan-management data, not general workspace info (contrast with
//          getMyWorkspaces/getWorkspace, which expose only the minimal
//          planSlug/chatEnabled flags to every member so the Open Chat
//          button can hide/show correctly for everyone).
// @route   GET /api/workspaces/:id/plan
// @access  Private (workspace owner only)
export const getWorkspacePlan = asyncHandler(async (req, res, next) => {
  const workspace = await loadWorkspaceForOwner(req, next);
  if (!workspace) return;

  const { planSlug, planName, memberLimit, chatEnabled, subscription } = await entitlementService.getEntitlements(req.params.id);
  const currentMemberCount = await WorkspaceMembership.countDocuments({
    workspace: req.params.id, status: { $ne: 'removed' }
  });
  const nextPlan = await buildNextPlanPreview(planSlug);

  res.status(200).json({
    success: true,
    data: {
      planSlug,
      planName,
      planStatus: subscription?.status || 'active',
      memberLimit,
      chatEnabled,
      currentMemberCount,
      isOwner: true,
      nextPlan,
    }
  });
});

// @desc    Self-serve, instant Free -> Pro upgrade. Neither app has a
//          payment gateway, so this is a direct plan switch — no billing
//          step. Sync to ChatApp and the realtime UI update both happen
//          inside changeSubscription (the one funnel every plan-change path
//          goes through).
// @route   POST /api/workspaces/:id/plan/upgrade-to-pro
// @access  Private (workspace owner only)
export const upgradeToPro = asyncHandler(async (req, res, next) => {
  const workspace = await loadWorkspaceForOwner(req, next);
  if (!workspace) return;

  const entitlements = await entitlementService.getEntitlements(req.params.id);

  // Idempotent: an owner re-submitting (double-click, stale tab) an
  // already-applied upgrade gets back the current state, not a duplicate
  // audit-log entry / webhook dispatch / realtime broadcast.
  if (entitlements.planSlug === 'pro') {
    return res.status(200).json({ success: true, data: { planSlug: 'pro', idempotentNoop: true } });
  }
  if (!isSelfServeTransitionAllowed(entitlements.planSlug, 'pro')) {
    return next(new ErrorResponse(`Cannot upgrade directly from ${entitlements.planName} to Pro.`, 400));
  }

  const proPlan = await Plan.findOne({ slug: 'pro', isActive: true });
  if (!proPlan) {
    return next(new ErrorResponse('The Pro plan is not currently available. Please try again shortly.', 503));
  }

  const subscription = await changeSubscription({
    workspaceId: req.params.id,
    planId: proPlan._id,
    notes: 'Self-serve upgrade (no payment gateway configured)',
    actor: req.user,
    // Compare-and-swap guard against a second, concurrent upgrade request —
    // see subscriptionService.js#changeSubscription's doc comment.
    expectedCurrentPlanId: entitlements.subscription?.plan?._id,
  });

  res.status(200).json({ success: true, data: subscription });
});

// @desc    Self-serve Pro -> Free downgrade — blocked unless the workspace
//          already fits within Free's member limit, since downgrading must
//          never silently strand existing members over the new cap.
// @route   POST /api/workspaces/:id/plan/downgrade-to-free
// @access  Private (workspace owner only)
export const downgradeToFree = asyncHandler(async (req, res, next) => {
  const workspace = await loadWorkspaceForOwner(req, next);
  if (!workspace) return;

  const entitlements = await entitlementService.getEntitlements(req.params.id);

  if (entitlements.planSlug === 'free') {
    return res.status(200).json({ success: true, data: { planSlug: 'free', idempotentNoop: true } });
  }
  if (!isSelfServeTransitionAllowed(entitlements.planSlug, 'free')) {
    return next(new ErrorResponse(`Cannot downgrade directly from ${entitlements.planName} to Free.`, 400));
  }

  const freePlan = await Plan.findOne({ slug: 'free', isActive: true });
  if (!freePlan) {
    return next(new ErrorResponse('The Free plan is not currently available. Please try again shortly.', 503));
  }

  const currentCount = await WorkspaceMembership.countDocuments({
    workspace: req.params.id, status: { $ne: 'removed' }
  });
  if (freePlan.memberLimit != null && currentCount > freePlan.memberLimit) {
    return next(new ErrorResponse(
      `Your workspace has ${currentCount} members, which is more than Free's ${freePlan.memberLimit}-member limit. Remove members down to ${freePlan.memberLimit} or fewer before downgrading.`,
      400
    ));
  }

  const subscription = await changeSubscription({
    workspaceId: req.params.id,
    planId: freePlan._id,
    notes: 'Self-serve downgrade',
    actor: req.user,
    expectedCurrentPlanId: entitlements.subscription?.plan?._id,
  });

  res.status(200).json({ success: true, data: subscription });
});
