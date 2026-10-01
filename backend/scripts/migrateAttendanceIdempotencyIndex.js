/**
 * Attendance Session Idempotency-Key Index Migration
 *
 * AttendanceSession's { workspaceId, user, idempotencyKey } unique index
 * used to be declared `sparse: true`. A COMPOUND sparse index only
 * excludes a document from the index when EVERY indexed field is missing
 * — workspaceId/user always exist, so every check-in made with no
 * caller-supplied idempotency key (the frontend never sends one) stored a
 * literal `idempotencyKey: null`, and a user's SECOND such session ever
 * (any two days, active or already closed) collided with the first one on
 * this index — surfacing as a false "already have an active attendance
 * session" / raw duplicate-key error with no real active session involved
 * at all. This migration replaces the plain sparse index with a partial
 * one (only sessions with a real, caller-supplied string idempotency key
 * are constrained), matching attendanceSession.model.js's schema
 * definition. Mirrors migrateCategoryIndex.js's identical fix for the
 * same class of bug. Idempotent and safe to run on every boot:
 *
 *   node backend/scripts/migrateAttendanceIdempotencyIndex.js
 */
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import '../config/index.js';
import AttendanceSession from '../modules/attendance/attendanceSession.model.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';

const INDEX_NAME = 'workspaceId_1_user_1_idempotencyKey_1';

export async function runAttendanceIdempotencyIndexMigration() {
  return workspaceContext.runUnscoped(async () => {
    const existing = await AttendanceSession.collection.indexes();
    const oldIndex = existing.find((idx) => idx.name === INDEX_NAME);

    let dropped = false;
    if (oldIndex && oldIndex.sparse && !oldIndex.partialFilterExpression) {
      await AttendanceSession.collection.dropIndex(INDEX_NAME);
      dropped = true;
    }

    // Recreate as partial (or create for the first time) — safe to call
    // even if it already exists with identical options.
    await AttendanceSession.collection.createIndex(
      { workspaceId: 1, user: 1, idempotencyKey: 1 },
      { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } }, name: INDEX_NAME }
    );

    return { droppedOldIndex: dropped };
  });
}

export default runAttendanceIdempotencyIndexMigration;

// Allow standalone execution: node backend/scripts/migrateAttendanceIdempotencyIndex.js
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
      const result = await runAttendanceIdempotencyIndexMigration();
      console.log('Migration result:', result);
      await mongoose.disconnect();
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
