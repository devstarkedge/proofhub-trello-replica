/**
 * Workspace Subscriptions Backfill Migration
 *
 * Creates a WorkspaceSubscription pointed at the "Legacy" plan (not Free)
 * for every pre-existing workspace lacking one. Legacy carries unlimited
 * limits deliberately: a workspace that already had, say, 40 members never
 * agreed to Free's 5-member cap, so silently assigning Free would
 * incorrectly flag them as over-limit on day one. Legacy is excluded from
 * the Super Admin assignment picker (Plan.isAssignableToNew: false) so it's
 * never chosen for a *new* workspace — only ever set by this one-time
 * migration.
 *
 * Calls seedPlans() itself first (idempotent) as a defensive safeguard,
 * since this migration CLI is a separate process invocation from server.js
 * and doesn't otherwise guarantee the Legacy plan already exists.
 *
 * Idempotent — only creates rows for workspaces that don't already have one.
 * After this runs once, workspaceController.createWorkspace's
 * createDefaultSubscription() call keeps every future workspace covered, so
 * this never needs to run again.
 *
 *   node backend/scripts/migrateWorkspaceSubscriptions.js
 */
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import '../config/index.js';
import Workspace from '../models/Workspace.js';
import Plan from '../models/Plan.js';
import WorkspaceSubscription from '../models/WorkspaceSubscription.js';
import { seedPlans } from '../utils/seed.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';

export async function runWorkspaceSubscriptionsMigration() {
  return workspaceContext.runUnscoped(async () => {
    await seedPlans();
    const legacyPlan = await Plan.findOne({ slug: 'legacy' });
    if (!legacyPlan) {
      throw new Error('Legacy plan not found after seedPlans() — cannot backfill subscriptions.');
    }

    const allWorkspaceIds = await Workspace.find({}).select('_id').lean();
    const existingSubscriptionWorkspaceIds = await WorkspaceSubscription.find({}).select('workspace').lean();
    const existingSet = new Set(existingSubscriptionWorkspaceIds.map((s) => String(s.workspace)));

    const missing = allWorkspaceIds.filter((w) => !existingSet.has(String(w._id)));
    if (missing.length === 0) {
      return { createdCount: 0 };
    }

    const docs = missing.map((w) => ({
      workspace: w._id,
      plan: legacyPlan._id,
      status: 'active',
      billingCycle: 'monthly',
      notes: 'Backfilled by migrateWorkspaceSubscriptions.js — pre-existing workspace, grandfathered onto the unlimited Legacy tier.'
    }));

    await WorkspaceSubscription.insertMany(docs, { ordered: false });
    return { createdCount: docs.length };
  });
}

export default runWorkspaceSubscriptionsMigration;

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
      const result = await runWorkspaceSubscriptionsMigration();
      console.log('Migration result:', result);
      await mongoose.disconnect();
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
