import '../config/index.js';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { v2 as cloudinary } from 'cloudinary';
import Attachment from '../models/Attachment.js';
import { attachmentPath } from '../services/attachmentDelivery.js';
import { runUnscoped } from '../modules/workspaces/workspaceContext.js';
import '../utils/cloudinary.js';

export function parseOwnedCloudinaryURL(value, cloudName = cloudinary.config().cloud_name) {
  let url; try { url = new URL(value); } catch { return null; }
  if (url.hostname !== 'res.cloudinary.com') return null; // External links retain their external access policy.
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== cloudName || !['image', 'video', 'raw'].includes(parts[1])) throw new Error('Legacy media belongs to an unrecognized cloud account; reconcile its ownership first.');
  const version = parts.findIndex((part, index) => index > 2 && /^v\d+$/.test(part));
  if (version < 0) throw new Error('Legacy media has no unambiguous versioned storage path; provide a reviewed mapping first.');
  const publicPath = decodeURIComponent(parts.slice(version + 1).join('/'));
  const format = publicPath.split('.').pop();
  return { publicId: parts[1] === 'raw' ? publicPath : publicPath.replace(/\.[^.\/]+$/, ''), resourceType: parts[1], deliveryType: parts[2], format };
}

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
export async function migratePrivateAttachments({ apply = false, cloud = cloudinary } = {}) {
  const embedded = await importEmbeddedFiles(apply, cloud);
  let checked = 0, migrated = 0;
  const cursor = Attachment.collection.find({ $or: [{ deliveryType: { $ne: 'authenticated' } }, { url: { $not: /^\/api\/attachments\/[^/]+\/content$/ } }] });
  for await (const asset of cursor) {
    checked += 1;
    if (!asset.workspaceId || !asset.board || !asset.publicId) throw new Error(`Attachment ${asset._id} has no reliable tenant/parent/storage reference; reconcile it first.`);
    if (!apply) continue;
    const resourceType = asset.resourceType === 'auto' ? 'raw' : asset.resourceType || 'raw';
    try {
      if (asset.deliveryType !== 'authenticated') {
      await cloud.uploader.rename(asset.publicId, asset.publicId, { resource_type: resourceType, type: asset.deliveryType || 'upload', to_type: 'authenticated', invalidate: true, overwrite: false });
      }
    } catch (error) {
      // Resume safely if storage conversion succeeded before a DB interruption.
      if (Number(error.http_code) !== 404) throw error;
      await cloud.api.resource(asset.publicId, { resource_type: resourceType, type: 'authenticated' });
    }
    const stable = attachmentPath(asset._id);
    const oldURLs = [...new Set([asset.url, asset.secureUrl, asset.thumbnailUrl, asset.previewUrl].filter(Boolean))];
    const entityIds = [asset.card, asset.subtask, asset.nanoSubtask, asset.comment].filter(Boolean);
    for (const [collection, fields] of [['cards', ['description']], ['subtasks', ['description']], ['subtasknanos', ['description']], ['comments', ['htmlContent']], ['versionhistories', ['content', 'htmlContent']]]) {
      const parents = collection === 'versionhistories' ? { entityId: { $in: entityIds } } : collection === 'comments' ? { $or: [{ _id: { $in: entityIds } }, { contextRef: { $in: entityIds } }] } : { _id: { $in: entityIds } };
      for (const field of fields) for (const url of oldURLs) await mongoose.connection.db.collection(collection).updateMany({ workspaceId: asset.workspaceId, ...parents, [field]: { $type: 'string' } }, [{ $set: { [field]: { $replaceAll: { input: `$${field}`, find: { $literal: url }, replacement: { $literal: stable } } } } }]);
    }
    await Attachment.collection.updateOne({ _id: asset._id, workspaceId: asset.workspaceId }, { $set: { deliveryType: 'authenticated', resourceType, url: stable, secureUrl: stable, thumbnailUrl: stable, previewUrl: stable } });
    migrated += 1;
  }
  return { apply, checked, migrated, embedded };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { await mongoose.connect(process.env.MONGO_URI, { autoIndex: false }); console.log(JSON.stringify(await runUnscoped(() => migratePrivateAttachments({ apply: process.argv.includes('--apply') })))); }
  finally { await mongoose.disconnect(); }
}
