/**
 * Migration Registry
 *
 * Central registry that tracks which migrations have been applied via a
 * `_migrations` MongoDB collection. Each migration is registered with a
 * unique name, a version string (for ordering), and the function to run.
 *
 * Usage (from the CLI — see migrate.js):
 *   const { runPendingMigrations, hasPendingMigrations } = await import('./migrationRegistry.js');
 *   await runPendingMigrations();          // apply all unapplied
 *   const pending = await hasPendingMigrations(); // check without running
 *
 * The individual migration scripts are NOT modified — they remain idempotent
 * and independently runnable (`node scripts/migrateX.js`). This registry
 * wraps them with tracking so the server no longer needs to run them on
 * every boot.
 */
import mongoose from 'mongoose';
import logger from '../utils/logger.js';

// ─── Import migration functions ──────────────────────────────────────────────
import { runPermissionEngineMigration } from './migratePermissionEngine.js';
import { runWorkspaceTypeMigration } from './migrateWorkspaceTypeFields.js';
import { runBillingTypeOptionsMigration } from './migrateBillingTypeOptions.js';
import { runCategoryIndexMigration } from './migrateCategoryIndex.js';

// ─── Migration definitions ──────────────────────────────────────────────────
// Order matters: migrations run in the order listed here.
// To add a new migration, append an entry to this array.
//
// Fields:
//   name    — unique identifier stored in the _migrations collection
//   version — ISO-ish timestamp for ordering / human readability
//   run     — async function that performs the migration and returns a result
const MIGRATIONS = [
  {
    name: 'permission_engine',
    version: '20250601',
    description: 'Backfill AccessOverride from legacy SalesPermission/UserPermission',
    run: runPermissionEngineMigration,
  },
  {
    name: 'workspace_type_fields',
    version: '20250602',
    description: 'Backfill workspace type field and retire personal type',
    run: runWorkspaceTypeMigration,
  },
  {
    name: 'billing_type_options',
    version: '20250603',
    description: 'Consolidate billing type options to global system records',
    run: runBillingTypeOptionsMigration,
  },
  {
    name: 'category_index',
    version: '20250604',
    description: 'Replace plain unique index with partial unique index on categories',
    run: runCategoryIndexMigration,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the raw MongoDB collection used for tracking applied migrations.
 * Lazily accessed — the connection must be open before calling this.
 */
function getMigrationsCollection() {
  return mongoose.connection.db.collection('_migrations');
}

/**
 * Returns the Set of migration names that have already been applied.
 */
async function getAppliedMigrations() {
  const col = getMigrationsCollection();
  const docs = await col.find({}, { projection: { name: 1 } }).toArray();
  return new Set(docs.map((d) => d.name));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns an array of migration definitions that have not yet been applied.
 * Safe to call without running anything — useful for startup warnings.
 */
export async function hasPendingMigrations() {
  const applied = await getAppliedMigrations();
  return MIGRATIONS.filter((m) => !applied.has(m.name));
}

/**
 * Returns the full status of all registered migrations (applied or pending).
 */
export async function getMigrationStatus() {
  const col = getMigrationsCollection();
  const appliedDocs = await col.find({}).sort({ appliedAt: 1 }).toArray();
  const appliedMap = new Map(appliedDocs.map((d) => [d.name, d]));

  return MIGRATIONS.map((m) => {
    const applied = appliedMap.get(m.name);
    return {
      name: m.name,
      version: m.version,
      description: m.description,
      status: applied ? 'applied' : 'pending',
      appliedAt: applied?.appliedAt || null,
      durationMs: applied?.durationMs || null,
    };
  });
}

/**
 * Runs all pending migrations in order and records each in `_migrations`.
 *
 * Options:
 *   force — array of migration names to re-run even if already applied
 *
 * Returns an array of { name, status, result, durationMs } objects.
 */
export async function runPendingMigrations({ force = [] } = {}) {
  const applied = await getAppliedMigrations();
  const col = getMigrationsCollection();
  const results = [];

  // Ensure a unique index on `name` so two concurrent runners can't both
  // record the same migration (belt-and-suspenders — the CLI is typically
  // run once, but this protects against accidents).
  await col.createIndex({ name: 1 }, { unique: true });

  for (const migration of MIGRATIONS) {
    const isForced = force.includes(migration.name);
    if (applied.has(migration.name) && !isForced) {
      results.push({ name: migration.name, status: 'skipped (already applied)' });
      continue;
    }

    const startTime = Date.now();
    try {
      const result = await migration.run();
      const durationMs = Date.now() - startTime;

      // Record in the tracking collection (upsert for forced re-runs)
      await col.updateOne(
        { name: migration.name },
        {
          $set: {
            name: migration.name,
            version: migration.version,
            description: migration.description,
            appliedAt: new Date(),
            durationMs,
            result: result ?? null,
          },
        },
        { upsert: true }
      );

      const logMsg = isForced
        ? `Migration re-applied (forced): ${migration.name}`
        : `Migration applied: ${migration.name}`;
      logger.info(logMsg, { durationMs, result });
      results.push({ name: migration.name, status: 'applied', result, durationMs });
    } catch (err) {
      const durationMs = Date.now() - startTime;
      logger.error(`Migration failed: ${migration.name}`, { error: err.message, durationMs });
      results.push({ name: migration.name, status: 'failed', error: err.message, durationMs });
      // Stop on first failure — don't run subsequent migrations that may
      // depend on this one having succeeded.
      break;
    }
  }

  return results;
}
