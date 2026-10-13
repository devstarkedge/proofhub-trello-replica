import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { LEAVE_CLIENT_ID_KEYS, LEAVE_CLIENT_ID_OPTIONS, LEAVE_CLIENT_ID_INDEX, LEGACY_LEAVE_CLIENT_ID_INDEX } from '../utils/leaveRequestIdentity.js';

const sameKeys = (index) => JSON.stringify(index.key) === JSON.stringify(LEAVE_CLIENT_ID_KEYS);
const corrected = (index) => sameKeys(index) && index.unique === true && !index.sparse &&
  JSON.stringify(index.partialFilterExpression) === JSON.stringify(LEAVE_CLIENT_ID_OPTIONS.partialFilterExpression) &&
  !index.collation && !index.hidden;

/** Explicit maintenance operation; never registered for automatic startup. */
export async function migrateLeaveRequestIdempotencyIndex({ db = mongoose.connection.db, apply = false, writesPaused = false } = {}) {
  if (!db) throw new Error('A database connection is required');
  if (apply && !writesPaused) throw new Error('Pause all Leave request writers and pass --writes-paused before applying this index migration');
  const collection = db.collection('leaverequests');
  const before = await collection.indexes().catch((error) => { if (error.code === 26) return []; throw error; });
  const relevant = before.filter((index) => sameKeys(index) || [LEAVE_CLIENT_ID_INDEX, LEGACY_LEAVE_CLIENT_ID_INDEX].includes(index.name));
  for (const index of relevant) {
    const old = index.name === LEGACY_LEAVE_CLIENT_ID_INDEX && sameKeys(index) && index.unique === true &&
      !index.partialFilterExpression && !index.collation && !index.hidden && (index.sparse === undefined || index.sparse === true);
    if (!corrected(index) && !old) throw new Error(`Unexpected definition for index ${index.name}; no indexes changed. Review it manually.`);
  }
  const conflicts = await collection.aggregate([
    { $match: { clientRequestId: { $type: 'string' } } },
    { $group: { _id: { workspaceId: '$workspaceId', requester: '$requester', clientRequestId: '$clientRequestId' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }, { $count: 'groups' }
  ], { maxTimeMS: 60000, allowDiskUse: true }).toArray();
  if (conflicts.length) throw new Error(`Found ${conflicts[0].groups} duplicate string-ID groups; no indexes or records changed. Review these records manually.`);
  const countBefore = await collection.countDocuments({});
  const result = { mode: apply ? 'apply' : 'inspect', database: db.databaseName, collection: collection.collectionName,
    existingIndexes: relevant, correctedIndex: { key: LEAVE_CLIENT_ID_KEYS, ...LEAVE_CLIENT_ID_OPTIONS },
    documentCount: countBefore, duplicateStringGroups: 0, changed: false };
  if (!apply) return result;

  // Build and verify the new protection FIRST. If this fails, the old index
  // remains untouched. Do not fall back to a drop-first migration.
  const equivalent = relevant.find(corrected);
  const protectedName = equivalent?.name || await collection.createIndex(LEAVE_CLIENT_ID_KEYS, LEAVE_CLIENT_ID_OPTIONS);
  let current = await collection.indexes();
  if (!current.some((index) => index.name === protectedName && corrected(index))) throw new Error('Corrected unique index could not be verified; old index retained');
  const legacy = current.find((index) => index.name === LEGACY_LEAVE_CLIENT_ID_INDEX && !corrected(index));
  if (legacy) {
    // Revalidate immediately before the single targeted drop.
    if (!sameKeys(legacy) || legacy.unique !== true || legacy.partialFilterExpression || legacy.collation || legacy.hidden || (legacy.sparse !== undefined && legacy.sparse !== true)) throw new Error('Legacy index changed concurrently; no index dropped');
    await collection.dropIndex(LEGACY_LEAVE_CLIENT_ID_INDEX);
    result.changed = true;
  }
  current = await collection.indexes();
  if (!current.some(corrected) || current.some((index) => index.name === LEGACY_LEAVE_CLIENT_ID_INDEX && !corrected(index))) throw new Error('Index verification failed; keep writers paused and inspect the indexes');
  const countAfter = await collection.countDocuments({});
  if (countAfter !== countBefore) throw new Error('Document count changed during maintenance; keep writers paused and investigate');
  return { ...result, changed: result.changed || !equivalent, verified: true, finalIndexes: current.filter(sameKeys), documentCountAfter: countAfter };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
  const args = process.argv.slice(2);
  try {
    if (args.some((arg) => !['--apply', '--writes-paused', '--inspect'].includes(arg)) || (args.includes('--apply') && args.includes('--inspect'))) throw new Error('Use --inspect (default) or --apply --writes-paused');
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGO_URI/MONGODB_URI is required');
    await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
    console.log(JSON.stringify(await migrateLeaveRequestIdempotencyIndex({ apply: args.includes('--apply'), writesPaused: args.includes('--writes-paused') }), null, 2));
  } catch (error) {
    // Do not print connection strings, document values, or MongoDB stacks.
    console.error('Leave request index migration:', error.code ? `Database operation failed (${error.code}); no documents were modified by this script.` : error.message);
    process.exitCode = 1;
  } finally { await mongoose.disconnect(); }
}
