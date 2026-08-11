/**
 * Workspace Type Fields Migration
 *
 * Backfills `type` on every pre-existing workspace created before the
 * enterprise workspace-creation wizard shipped. Idempotent (only touches
 * documents where `type` doesn't exist yet) and safe to run on every boot:
 *
 *   node backend/scripts/migrateWorkspaceTypeFields.js
 *
 * Default backfill is `type: 'team'` — the least presumptuous choice for a
 * workspace that already has real usage (not 'personal', which changes
 * required-field behavior elsewhere; not 'company', which would falsely
 * imply industry/companySize should have been collected).
 */
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import '../config/index.js';
import Workspace from '../models/Workspace.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';

export async function runWorkspaceTypeMigration() {
  return workspaceContext.runUnscoped(async () => {
    const result = await Workspace.collection.updateMany(
      { type: { $exists: false } },
      { $set: { type: 'team', industry: null, companySize: null } }
    );
    return { modifiedCount: result.modifiedCount };
  });
}

export default runWorkspaceTypeMigration;

// Allow standalone execution: node backend/scripts/migrateWorkspaceTypeFields.js
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
      const result = await runWorkspaceTypeMigration();
      console.log('Migration result:', result);
      await mongoose.disconnect();
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
