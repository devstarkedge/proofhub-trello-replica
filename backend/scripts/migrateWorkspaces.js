/**
 * Workspace Migration
 *
 * Foundation-phase backfill for the workspace multi-tenant migration:
 *   1. Reconciles every workspace-owned model's indexes with its current
 *      schema (drops stale standalone-unique indexes replaced by compound
 *      { workspaceId, ... } ones — e.g. Role.slug, Department.name).
 *   2. Ensures the default workspace exists (reuses the pre-existing
 *      ensureDefaultWorkspace() bootstrap unchanged).
 *   3. Backfills `workspaceId` onto every existing row across every
 *      workspace-owned collection (see _workspaceOwnedModels.js).
 *   4. Creates one WorkspaceMembership per existing User, copying their
 *      current role/department/accessType/allowedProjects — the source
 *      `protect` (backend/middleware/authMiddleware.js) overlays onto
 *      req.user from now on.
 *
 * Idempotent — every step is safe to re-run (steps 1/2 are no-ops once
 * applied; step 3 only touches rows missing workspaceId; step 4 uses
 * $setOnInsert so a re-run never clobbers a membership that has since
 * diverged from the legacy User fields). Runs non-fatally at every boot
 * (see server.js) and can also be run standalone:
 *
 *   node backend/scripts/migrateWorkspaces.js
 *
 * Must run inside workspaceContext.runUnscoped() — this script has no
 * ambient request/workspace context of its own, and every model it touches
 * is guarded by workspaceScopePlugin.js.
 */
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import '../config/index.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import AccessOverride from '../models/AccessOverride.js';
import Workspace from '../models/Workspace.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import { ensureDefaultWorkspace } from '../modules/permissions/workspaceService.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import { WORKSPACE_OWNED_MODELS } from './_workspaceOwnedModels.js';

async function migrateIndexes() {
  const models = [Workspace, Role, AccessOverride, ...WORKSPACE_OWNED_MODELS.map((m) => m.model)];
  const results = [];
  for (const model of models) {
    try {
      await model.syncIndexes();
      results.push({ model: model.modelName, status: 'synced' });
    } catch (error) {
      results.push({ model: model.modelName, status: 'error', error: error.message });
    }
  }
  return results;
}

// Every backfill below goes through model.collection (the raw MongoDB
// driver collection) rather than the Mongoose model's own updateMany().
// Two models — MilestoneApproval and MilestoneRevenueRecognition —
// unconditionally reject every updateMany/updateOne with an
// "immutable history" error (by design, to keep their append-only ledger
// safe from accidental edits); going through the raw driver is what a
// pure field backfill like this needs anyway (no document validation or
// casting is required for a $set of one already-typed field), and it
// sidesteps that guard correctly rather than fighting it.
async function backfillWorkspaceId(workspaceId) {
  const counts = {};
  for (const { model, name } of WORKSPACE_OWNED_MODELS) {
    const result = await model.collection.updateMany(
      { workspaceId: { $exists: false } },
      { $set: { workspaceId } }
    );
    counts[name] = result.modifiedCount;
  }
  return counts;
}

async function backfillRoleWorkspace() {
  // System-role templates (isSystem: true) keep workspaceId: null forever —
  // only backfill custom roles that predate this migration.
  const result = await Role.collection.updateMany(
    { isSystem: { $ne: true }, workspaceId: { $exists: false } },
    { $set: { workspaceId: null } }
  );
  return result.modifiedCount;
}

async function backfillAccessOverrideWorkspace(workspaceId) {
  // Most rows already carry `workspace` via ensureDefaultWorkspace() being
  // stamped at write time (accessControlService.js) — this is a safety net
  // for anything created before that was wired up.
  const result = await AccessOverride.collection.updateMany(
    { workspace: { $exists: false } },
    { $set: { workspace: workspaceId } }
  );
  return result.modifiedCount;
}

async function createMembershipsForExistingUsers(workspaceId) {
  const users = await User.find({}).lean();
  let created = 0;
  let alreadyExisting = 0;

  for (const user of users) {
    const result = await WorkspaceMembership.findOneAndUpdate(
      { workspace: workspaceId, user: user._id },
      {
        $setOnInsert: {
          workspace: workspaceId,
          user: user._id,
          role: user.role,
          roleId: user.roleId,
          department: user.department || [],
          team: user.team,
          accessType: user.accessType,
          allowedProjects: user.allowedProjects || [],
          status: 'active',
          joinedAt: user.createdAt || new Date()
        }
      },
      { upsert: true, new: false, includeResultMetadata: true }
    );

    if (result.lastErrorObject?.updatedExisting) {
      alreadyExisting += 1;
    } else {
      created += 1;
    }

    if (!user.lastActiveWorkspace) {
      await User.updateOne(
        { _id: user._id, $or: [{ lastActiveWorkspace: { $exists: false } }, { lastActiveWorkspace: null }] },
        { $set: { lastActiveWorkspace: workspaceId } }
      );
    }
  }

  return { created, alreadyExisting, totalUsers: users.length };
}

export async function runWorkspaceMigration() {
  return workspaceContext.runUnscoped(async () => {
    const workspace = await ensureDefaultWorkspace();
    if (!workspace) {
      // Fresh install, before seedAdmin() has created the first admin.
      return { skipped: true, reason: 'No admin user yet — nothing to migrate' };
    }

    const indexResults = await migrateIndexes();
    const modelsBackfilled = await backfillWorkspaceId(workspace);
    const rolesBackfilled = await backfillRoleWorkspace();
    const accessOverridesBackfilled = await backfillAccessOverrideWorkspace(workspace);
    const memberships = await createMembershipsForExistingUsers(workspace);

    return {
      workspaceId: workspace.toString(),
      indexResults,
      modelsBackfilled,
      rolesBackfilled,
      accessOverridesBackfilled,
      memberships
    };
  });
}

export default runWorkspaceMigration;

// Allow standalone execution: node backend/scripts/migrateWorkspaces.js
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
      const result = await runWorkspaceMigration();
      console.log('Workspace migration result:', JSON.stringify(result, null, 2));
      await mongoose.disconnect();
    })
    .catch((err) => {
      console.error('Workspace migration failed:', err);
      process.exit(1);
    });
}
