/**
 * Permission Engine Migration
 *
 * Backfills the new AccessOverride collection from the two legacy
 * permission tables (SalesPermission, UserPermission) so that centralizing
 * the read/write path loses zero existing access. Idempotent — safe to run
 * on every boot (upserts by {user, resource}), and safe to re-run manually:
 *
 *   node backend/scripts/migratePermissionEngine.js
 *
 * This does NOT delete SalesPermission/UserPermission data — they're kept
 * as the pre-migration historical record and as a rollback fallback (see
 * docs/access-control-migration.md).
 */
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import '../config/index.js';
import User from '../models/User.js';
import SalesPermission from '../models/SalesPermission.js';
import UserPermission, { FINANCE_PAGE_KEY } from '../models/UserPermission.js';
import AccessOverride from '../models/AccessOverride.js';
import { fromLegacyShape } from '../config/permissionRegistry.js';
import { ensureDefaultWorkspace } from '../modules/permissions/workspaceService.js';

export async function runPermissionEngineMigration() {
  const workspace = await ensureDefaultWorkspace();
  if (!workspace) {
    return { skipped: true, reason: 'No admin user yet — nothing to migrate' };
  }

  let salesMigrated = 0;
  const salesPerms = await SalesPermission.find({}).lean();
  for (const perm of salesPerms) {
    const actions = fromLegacyShape('sales', perm);
    await AccessOverride.findOneAndUpdate(
      { user: perm.user, resource: 'sales' },
      {
        $setOnInsert: { user: perm.user, resource: 'sales' },
        $set: {
          workspace,
          effect: 'grant',
          actions,
          scope: 'full',
          grantedBy: perm.grantedBy,
          reason: perm.notes || '',
          isActive: true
        }
      },
      { upsert: true }
    );
    salesMigrated += 1;
  }

  let financeMigrated = 0;
  const financePerms = await UserPermission.find({ pageKey: FINANCE_PAGE_KEY }).lean();
  for (const perm of financePerms) {
    const actions = fromLegacyShape('finance', perm);
    await AccessOverride.findOneAndUpdate(
      { user: perm.user, resource: 'finance' },
      {
        $setOnInsert: { user: perm.user, resource: 'finance' },
        $set: {
          workspace,
          effect: 'grant',
          actions,
          scope: 'full',
          grantedBy: perm.grantedBy,
          isActive: true
        }
      },
      { upsert: true }
    );
    financeMigrated += 1;
  }

  return { salesMigrated, financeMigrated };
}

export default runPermissionEngineMigration;

// Allow standalone execution: node backend/scripts/migratePermissionEngine.js
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
      const result = await runPermissionEngineMigration();
      console.log('Migration result:', result);
      await mongoose.disconnect();
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
