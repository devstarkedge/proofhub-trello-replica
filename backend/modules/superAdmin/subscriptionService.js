import Plan from '../../models/Plan.js';
import WorkspaceSubscription from '../../models/WorkspaceSubscription.js';
import Workspace from '../../models/Workspace.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { recordSuperAdminAuditLog } from './superAdminAuditService.js';
import chatHooks from '../../utils/chatHooks.js';
import * as entitlementService from '../plans/entitlementService.js';
import logger from '../../utils/logger.js';

/**
 * Called right after a new workspace is created (workspaceController.js /
 * authController.js) so every workspace has exactly one subscription row
 * from creation onward — the one-time backfill migration
 * (scripts/migrateWorkspaceSubscriptions.js) only ever needs to run once,
 * for workspaces that pre-date this feature.
 *
 * Idempotent and defensive: returns the existing row if one already exists,
 * and no-ops (rather than throwing) if the Free/default plan hasn't been
 * seeded yet — workspace creation must never fail because of a missing
 * platform catalog row.
 */
export async function createDefaultSubscription(workspaceId) {
  const existing = await WorkspaceSubscription.findOne({ workspace: workspaceId });
  if (existing) return existing;

  const defaultPlan = await Plan.findOne({ isDefault: true, isActive: true });
  if (!defaultPlan) return null;

  return WorkspaceSubscription.create({
    workspace: workspaceId,
    plan: defaultPlan._id,
    status: 'active',
    billingCycle: defaultPlan.billingCycleDefault
  });
}

/**
 * Assigns a specific self-serve plan (Free or Pro — Enterprise is never
 * created through this path, see workspaceController.js#createWorkspace) to
 * a brand-new workspace, at creation time. Falls back to whatever plan is
 * marked `isDefault` if the requested slug doesn't resolve to an
 * active/assignable plan (e.g. not seeded yet on a fresh deploy) — mirrors
 * createDefaultSubscription's own "never fail workspace creation over a
 * missing catalog row" defensiveness. Must be awaited by the caller (unlike
 * createDefaultSubscription's fire-and-forget precedent) because the
 * eager ChatApp sync that runs right after workspace creation needs the
 * real plan to already be persisted — see workspaceChatSyncService.js.
 */
export async function createSubscriptionForNewWorkspace(workspaceId, { planSlug } = {}) {
  const existing = await WorkspaceSubscription.findOne({ workspace: workspaceId });
  if (existing) return existing;

  let plan = planSlug
    ? await Plan.findOne({ slug: planSlug, isActive: true, isAssignableToNew: true })
    : null;
  if (!plan) {
    plan = await Plan.findOne({ isDefault: true, isActive: true });
  }
  if (!plan) return null;

  return WorkspaceSubscription.create({
    workspace: workspaceId,
    plan: plan._id,
    status: 'active',
    billingCycle: plan.billingCycleDefault
  });
}

/**
 * Super Admin manually assigns/changes a workspace's plan. No payment
 * gateway is involved — this is the one place that data changes.
 *
 * `expectedCurrentPlanId` is an optional compare-and-swap guard: when
 * supplied (always by the self-serve owner endpoints in
 * workspacePlanController.js, which read the plan they observed just
 * before initiating the change; never by the Super Admin billing path,
 * which keeps today's unconditional-overwrite behavior), the update only
 * applies if the workspace is still on that exact plan. Two concurrent
 * "Confirm Upgrade" clicks: only the first's CAS matches and applies — the
 * second's filter no longer matches (the plan already moved) and it falls
 * through as a harmless idempotent no-op instead of a duplicate audit-log
 * entry, a duplicate ChatApp webhook dispatch, and a duplicate realtime
 * broadcast. Mirrors the same findOneAndUpdate-on-a-precondition idiom
 * already used for WorkspaceInvitation's accept/resend/revoke.
 */
export async function changeSubscription({ workspaceId, planId, billingCycle, status, notes, actor, expectedCurrentPlanId, customMemberLimit }) {
  const plan = await Plan.findById(planId);
  if (!plan) {
    throw new ErrorResponse('Plan not found', 404);
  }

  // Only Enterprise has a per-workspace member cap (WorkspaceSubscription
  // .customMemberLimit) — every other plan uses its shared, global
  // Plan.memberLimit instead, so the field is meaningless (and cleared) for
  // them. Caller (superAdminPlanController.js) is responsible for requiring
  // and validating a positive integer whenever `plan.slug === 'enterprise'`;
  // this function just persists whatever resolved value it's handed.
  const resolvedCustomMemberLimit = plan.slug === 'enterprise' ? (customMemberLimit ?? null) : null;

  let subscription;
  let before;

  if (expectedCurrentPlanId) {
    const preImage = await WorkspaceSubscription.findOneAndUpdate(
      { workspace: workspaceId, plan: expectedCurrentPlanId },
      {
        $set: {
          plan: plan._id,
          ...(billingCycle && { billingCycle }),
          ...(status && { status }),
          ...(notes !== undefined && { notes }),
          customMemberLimit: resolvedCustomMemberLimit,
          changedBy: actor.id,
        },
      },
      { new: false }
    );

    if (!preImage) {
      // Already on the target plan (lost a race to an identical request) or
      // moved to something else entirely concurrently — re-report the
      // CURRENT state instead of erroring or blindly overwriting it.
      const current = await WorkspaceSubscription.findOne({ workspace: workspaceId }).populate('plan').lean();
      return { ...current, idempotentNoop: true };
    }

    subscription = preImage; // pre-image: still carries the OLD plan/status/etc, used as `before`
    before = {
      plan: subscription.plan, status: subscription.status, billingCycle: subscription.billingCycle,
      notes: subscription.notes, customMemberLimit: subscription.customMemberLimit,
    };
  } else {
    subscription = await WorkspaceSubscription.findOne({ workspace: workspaceId });
    before = subscription
      ? {
          plan: subscription.plan, status: subscription.status, billingCycle: subscription.billingCycle,
          notes: subscription.notes, customMemberLimit: subscription.customMemberLimit,
        }
      : null;

    if (!subscription) {
      subscription = new WorkspaceSubscription({ workspace: workspaceId });
    }

    subscription.plan = plan._id;
    if (billingCycle) subscription.billingCycle = billingCycle;
    if (status) subscription.status = status;
    if (notes !== undefined) subscription.notes = notes;
    subscription.customMemberLimit = resolvedCustomMemberLimit;
    subscription.changedBy = actor.id;
    await subscription.save();
  }

  const changeDetails = [
    { label: 'Subscription Plan', previous: before?.plan?.name || before?.plan || 'None', next: plan.name }
  ];
  if (billingCycle && before?.billingCycle !== billingCycle) {
    changeDetails.push({ label: 'Billing Cycle', previous: before?.billingCycle || 'monthly', next: billingCycle });
  }
  if (status && before?.status !== status) {
    changeDetails.push({ label: 'Subscription Status', previous: before?.status || 'active', next: status });
  }
  if (before?.customMemberLimit !== resolvedCustomMemberLimit) {
    changeDetails.push({
      label: 'Member Limit',
      previous: before?.customMemberLimit ?? 'Not configured',
      next: resolvedCustomMemberLimit ?? 'Not configured',
    });
  }

  // Computed explicitly from the same fallback rules applied above, rather
  // than read back off `subscription` — in the CAS branch `subscription` is
  // the PRE-image (old values, by design, so `before` above is accurate),
  // so reading post-change values off it directly would silently log the
  // OLD plan as the "after" state.
  const after = {
    plan: plan._id,
    status: status || before?.status || 'active',
    billingCycle: billingCycle || before?.billingCycle || 'monthly',
    notes: notes !== undefined ? notes : before?.notes,
    customMemberLimit: resolvedCustomMemberLimit,
  };

  await recordSuperAdminAuditLog({
    actor,
    workspace: workspaceId,
    action: 'SUPER_ADMIN_PLAN_CHANGED',
    targetType: 'WorkspaceSubscription',
    targetId: subscription._id,
    resourceKey: 'workspace_billing',
    summary: `${actor.name || actor.email} changed plan to "${plan.name}"`,
    changeDetails,
    before,
    after
  });

  // A fresh plan means a fresh Free-limit-notification cycle — clear
  // regardless of direction (upgrade away from Free, or a Super Admin
  // dropping a workspace back to Free) so the next genuine limit-hit can
  // notify the owner again instead of staying silently suppressed forever.
  Workspace.updateOne({ _id: workspaceId }, { $set: { planLimitNotifiedAt: null } }).catch((err) => {
    logger.error('Failed to clear planLimitNotifiedAt after plan change', { error: err.message, workspaceId: String(workspaceId) });
  });

  // Sync to ChatApp + notify connected clients — both fire-and-forget, one
  // call site covers every trigger (self-serve upgrade/downgrade AND this
  // Super Admin path both funnel through changeSubscription).
  const workspaceDoc = await Workspace.findById(workspaceId).select('name slug').lean();
  if (workspaceDoc) {
    // Resolved (not raw plan.memberLimit) so Enterprise's per-workspace cap
    // reaches ChatApp/realtime listeners correctly — see resolveMemberLimit.
    const entitlementPayload = {
      planSlug: plan.slug, planName: plan.name,
      memberLimit: entitlementService.resolveMemberLimit(plan, { customMemberLimit: resolvedCustomMemberLimit }),
    };
    chatHooks.onWorkspacePlanChanged(workspaceDoc, entitlementPayload, actor).catch((err) => {
      logger.error('Failed to dispatch workspace plan-changed webhook', { error: err.message, workspaceId: String(workspaceId) });
    });
    entitlementService.notifyWorkspacePlanUpdated(workspaceId, {
      ...entitlementPayload, chatEnabled: plan.slug !== 'free',
    }).catch((err) => {
      logger.error('Failed to emit realtime workspace-plan-updated', { error: err.message, workspaceId: String(workspaceId) });
    });
  }

  return WorkspaceSubscription.findById(subscription._id).populate('plan').lean();
}
