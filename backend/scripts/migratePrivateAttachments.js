import '../config/index.js';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { v2 as cloudinary } from 'cloudinary';
import Attachment from '../models/Attachment.js';
import { attachmentPath } from '../services/attachmentDelivery.js';
import { runUnscoped } from '../modules/workspaces/workspaceContext.js';
import '../utils/cloudinary.js';
import { resolveAttachmentParents, isAnnouncementAttachment } from './attachmentMigrationReferences.js';

import { parseOwnedCloudinaryURL, resolveStorageMetadata } from './attachmentStorageMigration.js';
import { prepareAttachmentQuarantine, preserveOrphanAttachment, isOrphanReferenceError } from './attachmentQuarantine.js';
import { createMigrationProgress } from './migrationProgress.js';
import { cloudinaryMigrationRequest, migrationErrorDetails } from './migrationErrors.js';
export { parseOwnedCloudinaryURL } from './attachmentStorageMigration.js';

async function importEmbeddedFiles(apply, cloud) {
  let embedded = 0;
  for (const [name, parentField, contextType] of [['cards', 'card', 'card'], ['subtasks', 'subtask', 'subtask'], ['subtasknanos', 'nanoSubtask', 'nanoSubtask'], ['comments', 'comment', 'comment']]) {
    const collection = mongoose.connection.db.collection(name);
    for await (const parent of collection.find({ 'attachments.url': /res\.cloudinary\.com\// })) {
      for (const file of parent.attachments || []) {
        const parsed = parseOwnedCloudinaryURL(file.url, cloud.config().cloud_name);
        if (!parsed) continue;
        embedded += 1;
        if (!parent.workspaceId) throw new Error(`Legacy file parent ${parent._id} has no workspace; reconcile it first.`);
        let boardId = parent.board;
        if (!boardId && parent.card) boardId = (await mongoose.connection.db.collection('cards').findOne({ _id: parent.card, workspaceId: parent.workspaceId }))?.board;
        if (!boardId) throw new Error(`Legacy file parent ${parent._id} has no project; reconcile it first.`);
        if (!apply) continue;
        const key = { workspaceId: parent.workspaceId, [parentField]: parent._id, publicId: parsed.publicId };
        let record = await Attachment.collection.findOne(key);
        if (!record) {
          const _id = new mongoose.Types.ObjectId();
          record = { ...key, ...parsed, _id, board: boardId, contextType, contextRef: parent._id, fileName: file.filename || file.original_name || file.originalName || 'attachment', originalName: file.originalName || file.original_name || file.filename || 'attachment', mimeType: file.mimetype || 'application/octet-stream', fileType: 'other', fileSize: file.size || file.file_size || 0, url: file.url, secureUrl: file.url, uploadedBy: file.uploadedBy || null, isDeleted: false, createdAt: file.createdAt || parent.createdAt || new Date(), updatedAt: new Date() };
          await Attachment.collection.insertOne(record);
        }
        await collection.updateOne({ _id: parent._id, workspaceId: parent.workspaceId }, { $set: { 'attachments.$[file].url': attachmentPath(record._id) }, $inc: { __v: 1 } }, { arrayFilters: [{ 'file.url': file.url }] });
      }
    }
  }
  return embedded;
}

// Explicit maintenance operation: dry run by default. Public CDN invalidation
// is asynchronous; operators must verify old URLs before reopening traffic.
const pendingFiles = { $or: [{ deliveryType: { $ne: 'authenticated' } }, { url: { $not: /^\/api\/attachments\/[^/]+\/content$/ } }] };
async function reconcileAttachment(asset, cloud) {
  const patch = await resolveAttachmentParents(asset);
  const storage = resolveStorageMetadata(asset, cloud);
  Object.assign(patch, storage.patch);
  const resolved = { ...asset, ...patch };
  return { resolved, patch, fields: Object.keys(patch).filter(key => String(asset[key] ?? '') !== String(patch[key] ?? '')) };
}
export async function migratePrivateAttachments({ apply = false, quarantineOrphans = false, cloud = cloudinary, onProgress = () => {} } = {}) {
  let embedded = 0, checked = 0, migrated = 0, recoverable = 0, blocked = 0, nonProject = 0, quarantineCandidates = 0, quarantined = 0;
  const issues = [], reconciliation = [], quarantineSamples = [];
  onProgress({ phase: 'preflight', checked, stage: 'counting candidate records (read-only)' });
  const total = await Attachment.collection.countDocuments(pendingFiles);
  const progress = (phase, extra = {}) => onProgress({ phase, total, checked, recoverable, quarantineCandidates, blocked, migrated, quarantined, ...extra });
  progress('preflight', { stage: 'checking embedded files (read-only)', force: true });
  // Preflight is entirely read-only. Even --apply must finish it before any
  // embedded metadata, editor content or cloud delivery is changed.
  try { embedded = await importEmbeddedFiles(false, cloud); }
  catch (error) { blocked += 1; issues.push({ phase: 'embedded', reason: error.message }); }
  for await (const asset of Attachment.collection.find(pendingFiles)) {
    checked += 1;
    progress('preflight', { attachmentId: String(asset._id), stage: 'checking ownership and saved references (read-only)' });
    try {
      if (await isAnnouncementAttachment(asset)) { nonProject += 1; continue; }
      const { fields } = await reconcileAttachment(asset, cloud);
      if (fields.length) {
        recoverable += 1;
        if (reconciliation.length < 100) reconciliation.push({ attachmentId: String(asset._id), fields });
      }
    } catch (error) {
      if (quarantineOrphans && isOrphanReferenceError(error)) {
        try {
          const plan = await prepareAttachmentQuarantine(asset, cloud);
          quarantineCandidates += 1;
          if (quarantineSamples.length < 100) quarantineSamples.push({ attachmentId: String(asset._id), reason: plan.reason, metadataOnly: plan.metadataOnly });
          continue;
        } catch (quarantineError) { error = quarantineError; }
      }
      blocked += 1;
      if (issues.length < 100) issues.push({ attachmentId: String(asset._id), missingFields: ['workspaceId', 'board', 'publicId'].filter(key => !asset[key]), reason: error.message });
    }
  }
  const report = { apply, quarantineOrphans, checked, migrated, embedded, recoverable, blocked, nonProject, quarantineCandidates, quarantined, issues, reconciliation, quarantineSamples, sampleLimit: 100 };
  progress('preflight-complete', { message: blocked ? 'Blocked: no migration writes started' : apply ? 'Checks passed; starting requested apply' : 'Read-only preview complete' });
  if (blocked) {
    const error = new Error('Private file preflight is blocked. No migration writes were started. Resolve the reported references before applying.');
    error.report = report; throw error;
  }
  if (!apply) { progress('complete', { message: 'Read-only preview; no changes applied' }); return report; }
  progress('applying', { processed: 0, stage: 'importing embedded file metadata' });
  await importEmbeddedFiles(true, cloud);
  let processed = 0;
  for await (const original of Attachment.collection.find(pendingFiles)) {
    processed += 1;
    const attachmentId = String(original._id);
    progress('applying', { processed, attachmentId, stage: 'resolving current attachment' });
    if (await isAnnouncementAttachment(original)) continue;
    let resolution;
    try { resolution = await reconcileAttachment(original, cloud); }
    catch (error) {
      if (!quarantineOrphans || !isOrphanReferenceError(error)) throw error;
      await preserveOrphanAttachment(original, cloud, event => progress('applying', { processed, attachmentId, ...event }));
      quarantined += 1;
      progress('applying', { processed, attachmentId, stage: 'quarantine committed', force: true });
      continue;
    }
    const { resolved: asset, patch } = resolution;
    const resourceType = asset.resourceType;
    progress('applying', { processed, attachmentId, stage: 'Cloudinary conversion (request timeout 45s)', force: true });
    try {
      if (asset.deliveryType !== 'authenticated') {
        await cloudinaryMigrationRequest('convert to authenticated delivery', () => cloud.uploader.rename(asset.publicId, asset.publicId, { resource_type: resourceType, type: asset.deliveryType || 'upload', to_type: 'authenticated', invalidate: true, overwrite: false, timeout: 45000 }));
      }
    } catch (error) {
      // Resume safely if storage conversion succeeded before a DB interruption.
      if (Number(error.http_code) !== 404) throw error;
      await cloudinaryMigrationRequest('check authenticated storage', () => cloud.api.resource(asset.publicId, { resource_type: resourceType, type: 'authenticated', timeout: 45000 }));
    }
    progress('applying', { processed, attachmentId, stage: 'updating editor links and attachment metadata', force: true });
    const stable = attachmentPath(asset._id);
    const oldURLs = [...new Set([asset.url, asset.secureUrl, asset.thumbnailUrl, asset.previewUrl].filter(Boolean))];
    const entityIds = [asset.card, asset.subtask, asset.nanoSubtask, asset.comment].filter(Boolean);
    for (const [collection, fields] of [['cards', ['description']], ['subtasks', ['description']], ['subtasknanos', ['description']], ['comments', ['htmlContent']], ['versionhistories', ['content', 'htmlContent']]]) {
      const parents = collection === 'versionhistories' ? { entityId: { $in: entityIds } } : collection === 'comments' ? { $or: [{ _id: { $in: entityIds } }, { contextRef: { $in: entityIds } }] } : { _id: { $in: entityIds } };
      for (const field of fields) for (const url of oldURLs) await mongoose.connection.db.collection(collection).updateMany({ workspaceId: asset.workspaceId, ...parents, [field]: { $type: 'string' } }, [{ $set: { [field]: { $replaceAll: { input: `$${field}`, find: { $literal: url }, replacement: { $literal: stable } } } } }]);
    }
    const updated = await Attachment.collection.updateOne({ _id: asset._id, workspaceId: original.workspaceId ?? null, board: original.board ?? null, publicId: original.publicId ?? null }, { $set: { ...patch, deliveryType: 'authenticated', resourceType, url: stable, secureUrl: stable, thumbnailUrl: stable, previewUrl: stable } });
    if (!updated.matchedCount) throw new Error(`Attachment ${asset._id} changed during maintenance; stop writes and rerun the preflight`);
    migrated += 1;
    progress('applying', { processed, attachmentId, stage: 'attachment migrated', force: true });
  }
  progress('complete', { processed, message: 'Apply completed successfully' });
  return { ...report, checked: processed, migrated, quarantined };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const output = createMigrationProgress();
  let latestProgress = {};
  try {
    const allowed = new Set(['--apply', '--quarantine-orphans']);
    if (process.argv.slice(2).some(flag => !allowed.has(flag))) throw new Error('Supported options: --quarantine-orphans (read-only preview), --apply (write changes).');
    output.report({ phase: 'connecting', message: 'Connecting to MongoDB; server selection timeout 15s' });
    await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000, socketTimeoutMS: 45000, waitQueueTimeoutMS: 15000, maxPoolSize: 5 });
    output.report({ phase: 'connected', message: process.argv.includes('--apply') ? 'APPLY mode requested' : 'Read-only preview mode' });
    console.log(JSON.stringify(await runUnscoped(() => migratePrivateAttachments({ apply: process.argv.includes('--apply'), quarantineOrphans: process.argv.includes('--quarantine-orphans'), onProgress: event => { latestProgress = event; output.report(event); } })), null, 2));
  }
  catch (error) {
    output.report({ ...latestProgress, phase: 'failed', message: 'Stopped; completed records are retained. Resolve the error, then resume the same apply command.' });
    if (error?.report) console.error(JSON.stringify(error.report, null, 2));
    console.error(JSON.stringify({ attachmentId: latestProgress.attachmentId, stage: latestProgress.stage, ...migrationErrorDetails(error) }, null, 2));
    process.exitCode = 1;
  }
  finally { output.close(); await mongoose.disconnect(); }
}
