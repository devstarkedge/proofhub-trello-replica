/**
 * Migration: Fix Employee Access Scope
 *
 * Finds all existing users with role === 'employee' who have
 * accessType !== 'assigned_tasks' and corrects them.
 *
 * Safe to run multiple times (idempotent).
 *
 * Usage:
 *   node scripts/migrateEmployeeAccessScope.js
 */

import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import path from 'path';

// Load env
import '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('ERROR: No MONGO_URI environment variable found.');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.');

  const User = (await import('../models/User.js')).default;

  // Find employees not on assigned_tasks scope
  const affected = await User.find({
    role: 'employee',
    accessType: { $ne: 'assigned_tasks' }
  }).select('_id name email accessType').lean();

  if (affected.length === 0) {
    console.log('No employees to migrate — all already have assigned_tasks scope.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${affected.length} employee(s) to migrate:`);
  for (const u of affected) {
    console.log(`  - ${u.name} (${u.email}) — current accessType: ${u.accessType}`);
  }

  const ids = affected.map(u => u._id);
  const result = await User.updateMany(
    { _id: { $in: ids } },
    { $set: { accessType: 'assigned_tasks', allowedProjects: [] } }
  );

  console.log(`\nMigration complete. Updated ${result.modifiedCount} employee(s) to accessType: 'assigned_tasks'.`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
