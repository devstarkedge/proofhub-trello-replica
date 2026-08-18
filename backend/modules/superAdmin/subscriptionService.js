import Plan from '../../models/Plan.js';
import WorkspaceSubscription from '../../models/WorkspaceSubscription.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { recordSuperAdminAuditLog } from './superAdminAuditService.js';

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
 * Super Admin manually assigns/changes a workspace's plan. No payment
 * gateway is involved — this is the one place that data changes.
 */
export async function changeSubscription({ workspaceId, planId, billingCycle, status, notes, actor }) {
  const plan = await Plan.findById(planId);
  if (!plan) {
    throw new ErrorResponse('Plan not found', 404);
  }

  let subscription = await WorkspaceSubscription.findOne({ workspace: workspaceId });
  const before = subscription
    ? { plan: subscription.plan, status: subscription.status, billingCycle: subscription.billingCycle, notes: subscription.notes }
    : null;

  if (!subscription) {
    subscription = new WorkspaceSubscription({ workspace: workspaceId });
  }

  subscription.plan = plan._id;
  if (billingCycle) subscription.billingCycle = billingCycle;
  if (status) subscription.status = status;
  if (notes !== undefined) subscription.notes = notes;
  subscription.changedBy = actor.id;
  await subscription.save();

  const changeDetails = [
    { label: 'Subscription Plan', previous: before?.plan?.name || before?.plan || 'None', next: plan.name }
  ];
  if (billingCycle && before?.billingCycle !== billingCycle) {
    changeDetails.push({ label: 'Billing Cycle', previous: before?.billingCycle || 'monthly', next: billingCycle });
  }
  if (status && before?.status !== status) {
    changeDetails.push({ label: 'Subscription Status', previous: before?.status || 'active', next: status });
  }

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
    after: { plan: subscription.plan, status: subscription.status, billingCycle: subscription.billingCycle, notes: subscription.notes }
  });

  return WorkspaceSubscription.findById(subscription._id).populate('plan').lean();
}
