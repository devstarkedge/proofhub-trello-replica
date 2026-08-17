/**
 * Billing Type Options Migration
 *
 * "Hourly Rate" and "Milestone" used to be lazily re-seeded as separate
 * documents in every workspace the first time its Billing Type dropdown was
 * opened (and never seeded at all in a workspace where it wasn't) — the
 * cause of both "a workspace shows zero billing type options" and "Fixed
 * Price can't be deleted" (all three were incorrectly marked isSystem).
 * This migration makes Hourly Rate and Milestone genuine global options
 * (workspaceId: null, isSystem: true, shared by every workspace via
 * ProjectDropdownOption's allowGlobal plugin option) and corrects every
 * pre-existing per-workspace document to match the new design. Idempotent
 * and safe to run on every boot:
 *
 *   node backend/scripts/migrateBillingTypeOptions.js
 */
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import '../config/index.js';
import ProjectDropdownOption from '../models/ProjectDropdownOption.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';

export async function runBillingTypeOptionsMigration() {
  return workspaceContext.runUnscoped(async () => {
    // 1. Ensure the two global system billing types exist (once, ever).
    const globalDefaults = [
      { value: 'hr', label: 'Hourly Rate', displayOrder: 0 },
      { value: 'milestone', label: 'Milestone', displayOrder: 2 }
    ];
    for (const opt of globalDefaults) {
      await ProjectDropdownOption.collection.updateOne(
        { type: 'billingType', value: opt.value, workspaceId: null },
        { $setOnInsert: { type: 'billingType', ...opt, workspaceId: null, isSystem: true, isActive: true } },
        { upsert: true }
      );
    }

    // 2. Remove old per-workspace duplicates created by the previous
    //    lazy-seed behavior (safe — Board.billingCycle stores raw strings,
    //    never these _ids).
    const removed = await ProjectDropdownOption.collection.deleteMany({
      type: 'billingType', value: { $in: ['hr', 'milestone'] }, workspaceId: { $ne: null }
    });

    // 3. Un-mark every remaining per-workspace billingType doc (Fixed
    //    Price, any already-added custom types) as non-system —
    //    grandfathers existing data into the corrected design instead of
    //    deleting it.
    const corrected = await ProjectDropdownOption.collection.updateMany(
      { type: 'billingType', workspaceId: { $ne: null } },
      { $set: { isSystem: false } }
    );

    return { removedDuplicates: removed.deletedCount, correctedCustom: corrected.modifiedCount };
  });
}

export default runBillingTypeOptionsMigration;

// Allow standalone execution: node backend/scripts/migrateBillingTypeOptions.js
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
      const result = await runBillingTypeOptionsMigration();
      console.log('Migration result:', result);
      await mongoose.disconnect();
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
