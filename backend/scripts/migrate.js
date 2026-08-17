#!/usr/bin/env node
/**
 * Migration CLI
 *
 * Standalone entry point for running database migrations outside of server
 * startup. Connects to MongoDB, applies pending migrations, then exits.
 *
 * Usage:
 *   node backend/scripts/migrate.js             # Run all pending migrations
 *   node backend/scripts/migrate.js --status     # Show status without running
 *   node backend/scripts/migrate.js --force X    # Re-run migration X even if applied
 *
 * npm scripts (from backend/):
 *   npm run migrate
 *   npm run migrate:status
 */
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import path from 'path';

// Load config (connects dotenv, validates env vars)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import config first to bootstrap environment
import '../config/index.js';
import config from '../config/index.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import {
  runPendingMigrations,
  getMigrationStatus,
  hasPendingMigrations,
} from './migrationRegistry.js';

// ─── Parse CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const showStatus = args.includes('--status');
const forceIndex = args.indexOf('--force');
const forceNames = forceIndex !== -1 ? args.slice(forceIndex + 1) : [];

async function main() {
  const mongoUri = config.db.uri;
  if (!mongoUri) {
    console.error('ERROR: No MONGO_URI/MONGODB_URI environment variable found.');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri, {
    maxPoolSize: config.db.maxPoolSize,
    serverSelectionTimeoutMS: config.db.serverSelectionTimeoutMS,
    socketTimeoutMS: config.db.socketTimeoutMS,
  });
  console.log('Connected to MongoDB.\n');

  try {
    if (showStatus) {
      // ── Status mode ──────────────────────────────────────────────────
      const status = await getMigrationStatus();
      console.log('Migration Status');
      console.log('─'.repeat(72));
      console.log(
        'Name'.padEnd(28),
        'Version'.padEnd(12),
        'Status'.padEnd(10),
        'Applied At'
      );
      console.log('─'.repeat(72));

      for (const m of status) {
        const appliedAt = m.appliedAt
          ? new Date(m.appliedAt).toISOString().replace('T', ' ').slice(0, 19)
          : '—';
        const statusStr = m.status === 'applied' ? '✓ applied' : '○ pending';
        console.log(
          m.name.padEnd(28),
          m.version.padEnd(12),
          statusStr.padEnd(10),
          appliedAt
        );
      }

      console.log('─'.repeat(72));
      const pendingCount = status.filter((m) => m.status === 'pending').length;
      if (pendingCount > 0) {
        console.log(`\n${pendingCount} pending migration(s). Run 'npm run migrate' to apply.`);
      } else {
        console.log('\nAll migrations are up to date.');
      }
    } else {
      // ── Run mode ─────────────────────────────────────────────────────
      const pending = await hasPendingMigrations();
      const hasForced = forceNames.length > 0;

      if (pending.length === 0 && !hasForced) {
        console.log('No pending migrations. Database is up to date.');
      } else {
        if (pending.length > 0) {
          console.log(`Found ${pending.length} pending migration(s):`);
          for (const m of pending) {
            console.log(`  ○ ${m.name} — ${m.description}`);
          }
          console.log();
        }
        if (hasForced) {
          console.log(`Force re-running: ${forceNames.join(', ')}\n`);
        }

        // Run inside unscoped workspace context (migrations bypass tenant scoping)
        const results = await workspaceContext.runUnscoped(async () => {
          return runPendingMigrations({ force: forceNames });
        });

        console.log('\nResults:');
        console.log('─'.repeat(72));
        for (const r of results) {
          const icon = r.status === 'applied' ? '✓' : r.status.startsWith('skipped') ? '–' : '✗';
          const duration = r.durationMs != null ? `${r.durationMs}ms` : '';
          console.log(`  ${icon} ${r.name.padEnd(28)} ${r.status.padEnd(22)} ${duration}`);
          if (r.error) {
            console.log(`    Error: ${r.error}`);
          }
        }
        console.log('─'.repeat(72));

        const failed = results.filter((r) => r.status === 'failed');
        if (failed.length > 0) {
          console.error(`\n${failed.length} migration(s) failed. Fix the issue and re-run.`);
          process.exitCode = 1;
        } else {
          console.log('\nAll migrations applied successfully.');
        }
      }
    }
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
  }
}

main().catch((err) => {
  console.error('Migration CLI error:', err);
  process.exit(1);
});
