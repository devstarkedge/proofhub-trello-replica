/**
 * Sales Watch-Alert Baseline Migration
 *
 * Seeds SalesTabWatchState for every pre-existing SalesTab that already has
 * isWatchTab:true, so the newly-added baseline/dedup engine
 * (modules/salesTabs/salesTab.alert.service.js) doesn't treat every
 * currently-matching row as a fresh transition the moment it ships —
 * without this, the first evaluation of each such tab would flood: every
 * row already matching its filters would look like a brand-new "New
 * matching row added" event (no prior SalesTabWatchState doc exists to say
 * otherwise), and every row already overdue / already past its
 * no-response threshold would fire immediately instead of only on a
 * genuinely new transition going forward.
 *
 * Rows that are ALREADY overdue/no-response at migration time have their
 * dedup marker pre-set as if already alerted — this is a deliberate,
 * product-visible tradeoff: the existing backlog does not retroactively
 * alert, only new transitions from this point forward do. That matches
 * "don't flood on first evaluation" (the alternative — alerting the entire
 * historical backlog the moment this ships — is worse).
 *
 * Idempotent — re-running only affects tabs whose matching-row set has
 * since changed (upsert-based, safe to re-run any time, e.g. after
 * restoring a backup or on a fresh environment).
 *
 * Usage:
 *   node backend/scripts/migrateSalesWatchBaseline.js
 */
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import '../config/index.js';
import SalesTab from '../modules/salesTabs/salesTab.model.js';
import { reconcileWatchBaseline } from '../modules/salesTabs/salesTab.watchState.service.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';

export async function runSalesWatchBaselineMigration() {
  return workspaceContext.runUnscoped(async () => {
    const watchTabs = await SalesTab.find({ isWatchTab: true, approvalStatus: 'approved' }).lean();

    let processed = 0;
    let errors = 0;
    for (const tab of watchTabs) {
      try {
        await workspaceContext.run({ workspaceId: tab.workspaceId }, () => reconcileWatchBaseline(tab));
        processed++;
      } catch (err) {
        errors++;
        console.error(`[Migration:SalesWatchBaseline] tab ${tab._id} failed:`, err.message);
      }
    }

    return { tabsFound: watchTabs.length, tabsProcessed: processed, errors };
  });
}

export default runSalesWatchBaselineMigration;

// Allow standalone execution: node backend/scripts/migrateSalesWatchBaseline.js
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
      const result = await runSalesWatchBaselineMigration();
      console.log('Sales watch baseline migration result:', JSON.stringify(result, null, 2));
      await mongoose.disconnect();
      // reconcileWatchBaseline() transitively imports queues/index.js (via
      // salesController.js/salesTab.service.js), which opens a real BullMQ/
      // Redis connection that otherwise keeps this CLI process alive
      // indefinitely after the migration work is done.
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
}
