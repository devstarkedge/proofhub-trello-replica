/**
 * Retire Legacy Plan Migration
 *
 * Two things, both one-time and persisted:
 *
 *  1. The workspace named "Stark Edge Team" is migrated to Enterprise,
 *     permanently. It is an ordinary Workspace document — no seed/bootstrap
 *     script creates or special-cases it — so it's located the same way any
 *     workspace would be: by its real `name`.
 *
 *  2. Every OTHER workspace still on the Legacy plan (or with no
 *     subscription row at all) gets a persisted Free-or-Pro TEST plan —
 *     never Enterprise, which is reserved exclusively for Stark Edge Team.
 *     The choice is randomized once, at migration time, and written to the
 *     database — never recalculated on every server start. A workspace
 *     whose real current member count already exceeds Free's limit is
 *     assigned Pro instead of flipping a coin, so the migration doesn't
 *     gratuitously create over-limit workspaces when Pro would have fit
 *     cleanly; true randomness decides the rest.
 *
 * Legacy itself is soft-retired (isActive:false, isAssignableToNew:false)
 * afterward — never deleted, so existing audit/history rows that reference
 * it stay resolvable — same precedent as how migratePlanCatalogV2.js
 * retired Business.
 *
 * Idempotent and safe to rerun: the query that selects "workspaces to
 * migrate off Legacy" only ever matches a workspace still pointing at the
 * Legacy plan (or with no subscription at all) — once migrated, a
 * workspace's subscription points at Free/Pro/Enterprise and no longer
 * matches, so a second run is a no-op for it. A workspace that was already
 * on a valid Free/Pro/Enterprise plan before this migration ever ran is
 * never touched, at any point. In practice this only ever executes once,
 * since scripts/migrationRegistry.js tracks it as applied in `_migrations`.
 *
 * Never modifies Workspace, WorkspaceMembership, Department, Board, or
 * WorkspaceIntegrationMapping — only Plan/WorkspaceSubscription documents
 * change. No workspace is recreated, no member/project/message data is
 * touched.
 *
 *   node backend/scripts/migrateRetireLegacyPlan.js
 */
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import '../config/index.js';
import Plan from '../models/Plan.js';
import Workspace from '../models/Workspace.js';
import WorkspaceSubscription from '../models/WorkspaceSubscription.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import { seedPlans } from '../utils/seed.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import { recordSuperAdminAuditLog } from '../modules/superAdmin/superAdminAuditService.js';

const STARK_EDGE_WORKSPACE_NAME = 'Stark Edge Team';
const SYSTEM_ACTOR = { name: 'System Migration', email: 'system@flowtask.internal' };

export async function runRetireLegacyPlanMigration() {
  return workspaceContext.runUnscoped(async () => {
    await seedPlans(); // defensive — ensures free/pro/enterprise exist even on a fresh deploy

    const [freePlan, proPlan, enterprisePlan, legacyPlan] = await Promise.all([
      Plan.findOne({ slug: 'free' }),
      Plan.findOne({ slug: 'pro' }),
      Plan.findOne({ slug: 'enterprise' }),
      Plan.findOne({ slug: 'legacy' }),
    ]);
    if (!freePlan || !proPlan || !enterprisePlan) {
      throw new Error('Free/Pro/Enterprise plans not found after seedPlans() — cannot run migration.');
    }

    // ── 1. Stark Edge Team -> Enterprise ────────────────────────────────
    const starkEdge = await Workspace.findOne({ name: STARK_EDGE_WORKSPACE_NAME }).select('_id name').lean();
    let starkEdgeResult = 'not_found';

    if (starkEdge) {
      const existingSub = await WorkspaceSubscription.findOne({ workspace: starkEdge._id });
      if (existingSub && String(existingSub.plan) === String(enterprisePlan._id)) {
        starkEdgeResult = 'already_enterprise';
      } else {
        const before = existingSub ? { plan: existingSub.plan, status: existingSub.status } : null;
        await WorkspaceSubscription.findOneAndUpdate(
          { workspace: starkEdge._id },
          {
            $set: { plan: enterprisePlan._id, status: 'active' },
            $setOnInsert: { workspace: starkEdge._id, billingCycle: enterprisePlan.billingCycleDefault },
          },
          { upsert: true }
        );
        starkEdgeResult = 'migrated';

        await recordSuperAdminAuditLog({
          actor: SYSTEM_ACTOR,
          workspace: starkEdge._id,
          workspaceName: starkEdge.name,
          action: 'SUPER_ADMIN_PLAN_CHANGED',
          targetType: 'WorkspaceSubscription',
          targetId: starkEdge._id,
          resourceKey: 'workspace_billing',
          summary: `Migrated "${starkEdge.name}" to Enterprise by migrateRetireLegacyPlan.`,
          changeDetails: [{ label: 'Subscription Plan', previous: before?.plan ? 'Legacy or other' : 'None', next: 'Enterprise' }],
          before,
          after: { plan: enterprisePlan._id, status: 'active' },
        });
      }
    }

    // ── 2. Every other workspace still on Legacy (or with no subscription
    //      at all) gets a persisted Free/Pro test assignment ─────────────
    const starkEdgeId = starkEdge ? String(starkEdge._id) : null;

    const legacySubs = legacyPlan
      ? await WorkspaceSubscription.find({ plan: legacyPlan._id }).select('_id workspace notes').lean()
      : [];
    const subscribedWorkspaceIds = new Set(
      (await WorkspaceSubscription.find({}).select('workspace').lean()).map((s) => String(s.workspace))
    );
    const allWorkspaceIds = await Workspace.find({}).select('_id').lean();
    const unsubscribedWorkspaces = allWorkspaceIds.filter(
      (w) => String(w._id) !== starkEdgeId && !subscribedWorkspaceIds.has(String(w._id))
    );

    let freeCount = 0;
    let proCount = 0;
    const migratedWorkspaceIds = [];

    for (const sub of legacySubs) {
      if (String(sub.workspace) === starkEdgeId) continue; // already handled above
      const targetPlan = await pickTestPlan(sub.workspace, freePlan, proPlan);
      const migrationNote = `Migrated off the retired Legacy plan to ${targetPlan.name} by migrateRetireLegacyPlan (test assignment).`;
      await WorkspaceSubscription.updateOne(
        { _id: sub._id },
        { $set: { plan: targetPlan._id, status: 'active', notes: [sub.notes, migrationNote].filter(Boolean).join(' | ') } }
      );
      if (targetPlan.slug === 'free') freeCount++; else proCount++;
      migratedWorkspaceIds.push(String(sub.workspace));
    }

    for (const w of unsubscribedWorkspaces) {
      const targetPlan = await pickTestPlan(w._id, freePlan, proPlan);
      await WorkspaceSubscription.create({
        workspace: w._id,
        plan: targetPlan._id,
        status: 'active',
        billingCycle: targetPlan.billingCycleDefault,
        notes: `Assigned ${targetPlan.name} by migrateRetireLegacyPlan (test assignment, no prior subscription).`,
      });
      if (targetPlan.slug === 'free') freeCount++; else proCount++;
      migratedWorkspaceIds.push(String(w._id));
    }

    if (migratedWorkspaceIds.length > 0) {
      await recordSuperAdminAuditLog({
        actor: SYSTEM_ACTOR,
        action: 'SUPER_ADMIN_PLAN_CATALOG_MIGRATED',
        targetType: 'Plan',
        targetId: legacyPlan?._id || null,
        resourceKey: 'workspace_billing',
        summary: `Retired the Legacy plan — migrated ${migratedWorkspaceIds.length} workspace(s) to a persisted Free/Pro test plan (${freeCount} Free, ${proCount} Pro)`,
        meta: { affectedWorkspaceIds: migratedWorkspaceIds },
      });
    }

    // ── 3. Soft-retire Legacy — never delete ────────────────────────────
    if (legacyPlan) {
      await Plan.updateOne({ _id: legacyPlan._id }, { $set: { isActive: false, isAssignableToNew: false } });
    }

    // ── 4. Report (never auto-fix) any workspace now over its plan's limit
    const overLimitWorkspaces = await findWorkspacesOverTheirPlanLimit(freePlan, proPlan);

    return { starkEdgeResult, freeCount, proCount, overLimitWorkspaces };
  });
}

/**
 * Deterministic bias, true randomness otherwise: if the workspace already
 * has more real members than Free's limit, Pro is the only sane choice —
 * no point gratuitously landing it over-limit on day one when Pro would
 * have fit. Otherwise a straight coin flip. This runs once per workspace,
 * at migration time only — the result is written to the database
 * immediately by the caller, never recomputed later.
 */
async function pickTestPlan(workspaceId, freePlan, proPlan) {
  if (freePlan.memberLimit != null) {
    const currentCount = await WorkspaceMembership.countDocuments({ workspace: workspaceId, status: { $ne: 'removed' } });
    if (currentCount > freePlan.memberLimit) return proPlan;
  }
  return Math.random() < 0.5 ? freePlan : proPlan;
}

/**
 * Reporting-only helper, mirroring migratePlanCatalogV2.js's own — for
 * every Free/Pro subscription, live-counts current members and flags any
 * workspace already over that plan's limit. Never acts on the result.
 */
async function findWorkspacesOverTheirPlanLimit(freePlan, proPlan) {
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
        overLimit.push({ workspaceId: String(sub.workspace), planSlug: plan.slug, currentCount, limit: plan.memberLimit });
      }
    }
  }
  return overLimit;
}

export default runRetireLegacyPlanMigration;

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
      const result = await runRetireLegacyPlanMigration();
      console.log('Migration result:', result);
      await mongoose.disconnect();
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
