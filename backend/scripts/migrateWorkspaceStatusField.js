/**
 * Workspace Status Field Migration
 *
 * Backfills `status` on every pre-existing workspace from its current
 * `isActive` value. Required, not just nice-to-have: Mongoose schema
 * defaults apply at document hydration/write time, not retroactively to
 * already-stored documents, and every Super Admin list/aggregate endpoint
 * uses .lean()/.aggregate() (which skip hydration) — so a pre-existing
 * workspace genuinely has no `status` key in Mongo until this runs, and
 * would read back as `status: undefined`, not the schema default.
 *
 * Idempotent (only touches documents where `status` doesn't exist yet) —
 * safe to run more than once.
 *
 *   node backend/scripts/migrateWorkspaceStatusField.js
 */
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import '../config/index.js';
import Workspace from '../models/Workspace.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';

export async function runWorkspaceStatusMigration() {
  return workspaceContext.runUnscoped(async () => {
    const activeResult = await Workspace.collection.updateMany(
      { status: { $exists: false }, isActive: { $ne: false } },
      { $set: { status: 'active' } }
    );
    const suspendedResult = await Workspace.collection.updateMany(
      { status: { $exists: false }, isActive: false },
      { $set: { status: 'suspended' } }
    );
    return { activatedCount: activeResult.modifiedCount, suspendedCount: suspendedResult.modifiedCount };
  });
}

export default runWorkspaceStatusMigration;

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
      const result = await runWorkspaceStatusMigration();
      console.log('Migration result:', result);
      await mongoose.disconnect();
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
