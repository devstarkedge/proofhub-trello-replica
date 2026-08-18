/**
 * One-time cleanup: removes the workspace(s) accidentally created at
 * slug "super-admin" — an artifact of using the normal self-service
 * "Create a workspace" signup flow to bootstrap the platform Super Admin
 * *account*, which (like any signup through that flow) also creates a real
 * workspace as a side effect. Super Admin is a platform-level role on User
 * (see models/User.js#isSuperAdmin) and must never be represented as a
 * workspace — see utils/seed.js#bootstrapSuperAdmin for the correct,
 * no-workspace-required way to create that account going forward, and
 * utils/slug.js's RESERVED_SLUGS (now includes 'super-admin') for why this
 * specific collision can't happen again.
 *
 * Not registered in migrationRegistry.js — this is a narrow, incident-
 * specific cleanup, not a schema-wide backfill applicable to every
 * deployment (a fresh deploy that never had this bug has nothing to clean).
 *
 * Safety: refuses to delete a matched workspace that has any real
 * business data under it (projects/boards) unless --force is passed, and
 * always preserves the owner's User account — only the workspace,
 * its membership row(s), and its subscription row are removed. Logs
 * exactly what it finds and what it does before doing it.
 *
 *   node backend/scripts/removeFakeSuperAdminWorkspace.js           # dry-run-safe: reports, deletes only if empty
 *   node backend/scripts/removeFakeSuperAdminWorkspace.js --force   # delete even if projects/boards exist under it
 */
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import '../config/index.js';
import Workspace from '../models/Workspace.js';
import User from '../models/User.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import WorkspaceSubscription from '../models/WorkspaceSubscription.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import { recordSuperAdminAuditLog } from '../modules/superAdmin/superAdminAuditService.js';

const TARGET_SLUG = 'super-admin';

export async function removeFakeSuperAdminWorkspace({ force = false } = {}) {
  return workspaceContext.runUnscoped(async () => {
    const matches = await Workspace.find({ slug: TARGET_SLUG });
    if (matches.length === 0) {
      console.log(`No workspace found at slug "${TARGET_SLUG}" — nothing to do.`);
      return { removed: [], skipped: [] };
    }

    const removed = [];
    const skipped = [];

    for (const workspace of matches) {
      console.log(`\nFound workspace "${workspace.name}" (slug: ${workspace.slug}, id: ${workspace._id})`);
      console.log(`  Owner: ${workspace.owner}, created: ${workspace.createdAt?.toISOString()}`);

      const [Board, memberships] = await Promise.all([
        import('../models/Board.js').then((m) => m.default),
        WorkspaceMembership.find({ workspace: workspace._id }).populate('user', 'email').lean()
      ]);
      // Must await INSIDE the callback — a bare `() => Board.countDocuments(...)`
      // returned un-awaited would resolve after this run() call already
      // returned, silently inheriting the OUTER runUnscoped's bypass context
      // instead of this one (or throwing, if no context were active at all).
      // Confirmed empirically: an earlier version of this exact line reported
      // 93 "projects in this workspace" — actually the unscoped COUNT OF EVERY
      // BOARD IN THE ENTIRE DATABASE, because of exactly this mistake. See
      // the identical class of bug already fixed in workspaceStatsService.js.
      const boardCount = await workspaceContext.run({ workspaceId: workspace._id }, async () => {
        return await Board.countDocuments({});
      });

      console.log(`  Members: ${memberships.length} (${memberships.map((m) => m.user?.email).filter(Boolean).join(', ') || 'none'})`);
      console.log(`  Projects (Boards): ${boardCount}`);

      if (boardCount > 0 && !force) {
        console.warn(`  SKIPPING — this workspace has ${boardCount} real project(s). Re-run with --force if you're certain this should still be removed.`);
        skipped.push({ id: workspace._id, name: workspace.name, boardCount });
        continue;
      }

      const ownerId = workspace.owner;

      await WorkspaceSubscription.deleteOne({ workspace: workspace._id });
      await WorkspaceMembership.deleteMany({ workspace: workspace._id });
      await Workspace.deleteOne({ _id: workspace._id });

      // Preserve the user — only clear the dangling pointer, matching the
      // same fallback logic workspaceController.deactivateWorkspace already
      // uses when a workspace a user was pointed at stops being usable.
      await User.updateMany({ lastActiveWorkspace: workspace._id }, { $set: { lastActiveWorkspace: null } });

      console.log(`  REMOVED workspace, ${memberships.length} membership row(s), and its subscription row. User account(s) preserved.`);

      await recordSuperAdminAuditLog({
        actor: null,
        action: 'SUPER_ADMIN_WORKSPACE_REMOVED',
        targetType: 'Workspace',
        targetId: workspace._id,
        targetName: workspace.name,
        summary: `Removed workspace "${workspace.name}" (slug: ${workspace.slug}) — accidental artifact of platform Super Admin bootstrap, not a real tenant`,
        changeDetails: [
          { label: 'Workspace', previous: `${workspace.name} (${workspace.slug})`, next: 'Removed' }
        ],
        meta: {}
      });

      removed.push({ id: workspace._id, name: workspace.name, ownerId });
    }

    return { removed, skipped };
  });
}

export default removeFakeSuperAdminWorkspace;

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const force = process.argv.includes('--force');
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('ERROR: No MONGO_URI/MONGODB_URI environment variable found.');
    process.exit(1);
  }
  mongoose.connect(mongoUri)
    .then(async () => {
      console.log('Connected to MongoDB.');
      const result = await removeFakeSuperAdminWorkspace({ force });
      console.log('\nDone.', result);
      await mongoose.disconnect();
    })
    .catch((err) => {
      console.error('removeFakeSuperAdminWorkspace failed:', err);
      process.exit(1);
    });
}
