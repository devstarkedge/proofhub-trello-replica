/**
 * Plan Catalog V2 Migration — retires the 'Business' tier and backfills the
 * new Free/Pro member limits (Free 5→10, Pro 25→20) onto Plan rows that were
 * seeded before this change. seedPlans() only ever CREATES missing rows, it
 * never updates existing ones — so on any deployment that already ran
 * seedPlans() once, this migration is what actually applies the new limits.
 *
 * Business is soft-retired (isActive:false, isAssignableToNew:false), never
 * deleted — same precedent as the Legacy tier — so existing audit/history
 * references to it stay resolvable. Any workspace still on Business is
 * reassigned to Enterprise (the closest fit: Business was the "growing past
 * Pro" tier, and Enterprise is now the only tier above Pro).
 *
 * Never auto-modifies membership: a workspace that already exceeds its
 * plan's NEW limit (nothing has ever enforced member limits before this
 * feature) is only reported via `overLimitWorkspaceIds`, never corrected —
 * no member is removed, no plan is force-changed. Once entitlementService.js
 * goes live, such a workspace simply can't add anyone new until it reduces
 * headcount or upgrades.
 *
 * Idempotent — safe to run more than once (re-running after Business has
 * already been retired is a no-op for that step; the Free/Pro limit backfill
 * is a plain overwrite either way).
 *
 *   node backend/scripts/migratePlanCatalogV2.js
 */
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import '../config/index.js';
import Plan from '../models/Plan.js';
import WorkspaceSubscription from '../models/WorkspaceSubscription.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import { seedPlans } from '../utils/seed.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import { recordSuperAdminAuditLog } from '../modules/superAdmin/superAdminAuditService.js';

export async function runPlanCatalogV2Migration() {
  return workspaceContext.runUnscoped(async () => {
    await seedPlans(); // defensive — ensures free/pro/enterprise exist even on a fresh deploy

    await Plan.updateOne({ slug: 'free' }, { $set: { memberLimit: 10 } });
    await Plan.updateOne({ slug: 'pro' }, { $set: { memberLimit: 20 } });

    const businessPlan = await Plan.findOne({ slug: 'business' });
    let reassignedCount = 0;

    if (businessPlan) {
      const enterprisePlan = await Plan.findOne({ slug: 'enterprise' });
      if (!enterprisePlan) {
        throw new Error('Enterprise plan not found — cannot reassign Business workspaces.');
      }

      const affected = await WorkspaceSubscription.find({ plan: businessPlan._id }).select('workspace notes').lean();

      for (const sub of affected) {
        const migrationNote = 'Migrated from the retired Business plan to Enterprise by migratePlanCatalogV2.';
        await WorkspaceSubscription.updateOne(
          { _id: sub._id },
          {
            $set: {
              plan: enterprisePlan._id,
              notes: [sub.notes, migrationNote].filter(Boolean).join(' | '),
            },
          }
        );
      }
      reassignedCount = affected.length;

      if (reassignedCount > 0) {
        await recordSuperAdminAuditLog({
          actor: { name: 'System Migration', email: 'system@flowtask.internal' },
          action: 'SUPER_ADMIN_PLAN_CATALOG_MIGRATED',
          targetType: 'Plan',
          targetId: businessPlan._id,
          resourceKey: 'workspace_billing',
          summary: `Retired the Business plan — migrated ${reassignedCount} workspace(s) to Enterprise`,
          meta: { affectedWorkspaceIds: affected.map((s) => String(s.workspace)) },
        });
      }

      // Soft-retire, never delete — preserves referential/audit history,
      // same as how the Legacy tier is handled.
      await Plan.updateOne({ _id: businessPlan._id }, { $set: { isActive: false, isAssignableToNew: false } });
    }

    const overLimitWorkspaceIds = await findWorkspacesOverTheirPlanLimit();

    return { businessReassignedCount: reassignedCount, overLimitWorkspaceIds };
  });
}

/**
 * Reporting-only helper — for every active/trialing Free or Pro
 * subscription, live-counts current members and flags any workspace already
 * over that plan's (new) limit. Never acts on the result.
 */
async function findWorkspacesOverTheirPlanLimit() {
  const [freePlan, proPlan] = await Promise.all([
    Plan.findOne({ slug: 'free' }).select('_id memberLimit').lean(),
    Plan.findOne({ slug: 'pro' }).select('_id memberLimit').lean(),
  ]);

  const overLimit = [];
  for (const plan of [freePlan, proPlan]) {
    if (!plan || plan.memberLimit == null) continue;
    const subs = await WorkspaceSubscription.find({ plan: plan._id }).select('workspace').lean();
    for (const sub of subs) {
      const currentCount = await WorkspaceMembership.countDocuments({
        workspace: sub.workspace,
        status: { $ne: 'removed' },
      });
      if (currentCount > plan.memberLimit) {
        overLimit.push({ workspaceId: String(sub.workspace), planSlug: plan === freePlan ? 'free' : 'pro', currentCount, limit: plan.memberLimit });
      }
    }
  }
  return overLimit;
}

export default runPlanCatalogV2Migration;

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('ERROR: No MONGO_URI/MONGODB_URI environment variable found.');
    process.exit(1);
  }
  mongoose.connect(mongoUri)
    .then(async () => {
      console.log('Connected to MongoDB.');
      const result = await runPlanCatalogV2Migration();
      console.log('Migration result:', result);
      await mongoose.disconnect();
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
