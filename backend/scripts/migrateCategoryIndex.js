/**
 * Category Unique Index Migration
 *
 * The { workspaceId, department, name } unique index on categories used to
 * apply unconditionally, so a soft-deleted category (deleteCategory only
 * sets isActive:false, never removes the document) permanently blocked
 * recreating a category with that same name in the same department —
 * surfacing as a raw MongoDB E11000 duplicate-key error even though the
 * create-time existence check (which correctly filters isActive:true)
 * found nothing. This migration replaces the plain unique index with a
 * partial one (only active categories are constrained), matching
 * models/Category.js's schema definition. Idempotent and safe to run on
 * every boot:
 *
 *   node backend/scripts/migrateCategoryIndex.js
 */
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import '../config/index.js';
import Category from '../models/Category.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';

const INDEX_NAME = 'workspaceId_1_department_1_name_1';

export async function runCategoryIndexMigration() {
  return workspaceContext.runUnscoped(async () => {
    const existing = await Category.collection.indexes();
    const oldIndex = existing.find((idx) => idx.name === INDEX_NAME);

    let dropped = false;
    if (oldIndex && !oldIndex.partialFilterExpression) {
      await Category.collection.dropIndex(INDEX_NAME);
      dropped = true;
    }

    // Recreate as partial (or create for the first time) — safe to call
    // even if it already exists with identical options.
    await Category.collection.createIndex(
      { workspaceId: 1, department: 1, name: 1 },
      { unique: true, partialFilterExpression: { isActive: true }, name: INDEX_NAME }
    );

    return { droppedOldIndex: dropped };
  });
}

export default runCategoryIndexMigration;

// Allow standalone execution: node backend/scripts/migrateCategoryIndex.js
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
      const result = await runCategoryIndexMigration();
      console.log('Migration result:', result);
      await mongoose.disconnect();
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
