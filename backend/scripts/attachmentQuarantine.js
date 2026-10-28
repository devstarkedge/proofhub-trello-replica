import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import Attachment from '../models/Attachment.js';
import AttachmentQuarantine from '../models/AttachmentQuarantine.js';
import { resolveAttachmentParents, isAnnouncementAttachment } from './attachmentMigrationReferences.js';
import { resolveStorageMetadata, secureQuarantinedStorage } from './attachmentStorageMigration.js';

const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const orphanCodes = new Set(['ATTACHMENT_PARENT_MISSING', 'ATTACHMENT_PARENT_UNLINKED', 'ATTACHMENT_CONTEXT_MISSING', 'ANNOUNCEMENT_PARENT_MISSING']);
export const isOrphanReferenceError = error => orphanCodes.has(error?.code);
const id = value => /^[a-f\d]{24}$/i.test(String(value)) ? new mongoose.Types.ObjectId(String(value)) : null;
const metacharacters = new Set(['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', String.fromCharCode(92)]);
const escape = value => [...value].map(character => metacharacters.has(character) ? String.fromCharCode(92) + character : character).join('');

async function assertUnused(asset, db) {
  const ids = [asset._id, String(asset._id)], publicIds = [asset.publicId, asset.public_id].filter(Boolean);
  const urls = [...new Set([asset.url, asset.secureUrl, asset.thumbnailUrl, asset.previewUrl].filter(value => typeof value === 'string' && value))];
  const needles = [...urls, `/api/attachments/${asset._id}/content`];
  for (const publicId of publicIds) needles.push(`/${publicId}`, `/${encodeURI(publicId)}`);
  // Individual patterns stay bounded and are literal, including legacy URLs.
  const regexes = needles.map(value => new RegExp(escape(value)));
  for (const [name, fields] of [['boards', ['description']], ['cards', ['description']], ['subtasks', ['description']], ['subtasknanos', ['description']], ['comments', ['htmlContent']], ['versionhistories', ['content', 'htmlContent']], ['announcements', ['content']]]) {
    const query = { $or: [{ coverImage: { $in: ids } }, { attachments: { $in: ids } }, { 'attachments._id': { $in: ids } }, { 'attachments.url': { $in: urls } }, { 'attachments.publicId': { $in: publicIds } }, { 'attachments.public_id': { $in: publicIds } }, { 'coverImage.publicId': { $in: publicIds } }, { 'coverImageHistory.publicId': { $in: publicIds } }, ...fields.flatMap(field => regexes.map(regex => ({ [field]: { $regex: regex } }))) ] };
    if (await db.collection(name).findOne(query, { projection: { _id: 1 }, maxTimeMS: 5000 })) throw new Error(`Attachment is still referenced by ${name}; resolve that reference before quarantine`);
  }
  if (publicIds.length && await db.collection('attachments').findOne({ _id: { $ne: asset._id }, publicId: { $in: publicIds }, contextType: 'announcement' }, { projection: { _id: 1 } })) throw new Error('Storage is shared with an announcement; review its delivery policy before quarantine');
}

export async function prepareAttachmentQuarantine(asset, cloud, db = mongoose.connection.db) {
  let reason;
  try {
    if (await isAnnouncementAttachment(asset, db)) throw new Error('A valid announcement cannot be quarantined by the project migration');
    await resolveAttachmentParents(asset, db);
    throw new Error('A valid project attachment cannot be quarantined');
  } catch (error) { if (!isOrphanReferenceError(error)) throw error; reason = error.message; }
  const workspaceId = id(asset.workspaceId);
  if (!workspaceId || !await db.collection('workspaces').findOne({ _id: workspaceId })) throw new Error('Orphan workspace is missing; a reviewed tenant mapping is required');
  // A live child with a broken ancestor requires restoration, not quarantine.
  for (const [field, name] of [['card', 'cards'], ['subtask', 'subtasks'], ['nanoSubtask', 'subtasknanos'], ['comment', 'comments']]) if (asset[field]) {
    if (!id(asset[field])) throw new Error('An orphan reference has an invalid ID; review its mapping');
    if (await db.collection(name).findOne({ _id: id(asset[field]) })) throw new Error('An owning task/comment still exists; repair its hierarchy before quarantine');
  }
  if (asset.contextRef) for (const name of ['boards', 'cards', 'subtasks', 'subtasknanos', 'comments', 'announcements']) if (await db.collection(name).findOne({ _id: id(asset.contextRef) })) throw new Error('An owning context still exists; repair its hierarchy before quarantine');
  const noLocator = ![asset.publicId, asset.public_id, asset.cloudinaryId, asset.url, asset.secureUrl, asset.thumbnailUrl, asset.previewUrl].some(Boolean);
  const storage = noLocator ? null : resolveStorageMetadata(asset, cloud);
  if (storage && !storage.ownedURL) throw new Error('Orphan has no verified owned cloud URL; review its storage mapping before quarantine');
  await assertUnused(asset, db);
  return { reason, workspaceId, storage: storage?.resolved, metadataOnly: noLocator, sourceFingerprint: fingerprint(asset) };
}

/** Explicit opt-in only. Full metadata is preserved before the first cloud
 * operation, then its move out of active attachments commits transactionally. */
export async function preserveOrphanAttachment(asset, cloud, onProgress = () => {}) {
  onProgress({ stage: 'rechecking orphan ownership and saved references' });
  const plan = await prepareAttachmentQuarantine(asset, cloud);
  const collection = AttachmentQuarantine.collection;
  onProgress({ stage: 'preserving complete original metadata', force: true });
  await collection.updateOne({ _id: asset._id, sourceFingerprint: plan.sourceFingerprint }, { $setOnInsert: {
    workspaceId: plan.workspaceId, original: asset, sourceFingerprint: plan.sourceFingerprint,
    reason: plan.reason, state: 'pending', preservedAt: new Date(),
    ...(plan.storage ? { publicId: plan.storage.publicId, resourceType: plan.storage.resourceType, deliveryType: plan.storage.deliveryType || 'upload' } : {})
  } }, { upsert: true });
  onProgress({ stage: plan.metadataOnly ? 'preserving metadata-only record' : 'Cloudinary conversion / existence check (request timeout 45s)', force: true });
  const state = plan.metadataOnly ? 'metadata_only' : await secureQuarantinedStorage(plan.storage, cloud);
  onProgress({ stage: 'committing quarantine transaction', force: true });
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const current = await Attachment.collection.findOne({ _id: asset._id }, { session });
      if (!current || fingerprint(current) !== plan.sourceFingerprint) throw new Error('Attachment changed during quarantine; stop writes and review before retrying');
      const preserved = await collection.updateOne({ _id: asset._id, sourceFingerprint: plan.sourceFingerprint }, { $set: { state, quarantinedAt: new Date(), ...(plan.storage ? { deliveryType: 'authenticated' } : {}) } }, { session });
      if (!preserved.matchedCount) throw new Error('Preserved metadata changed during quarantine; review before retrying');
      await Attachment.collection.deleteOne({ _id: asset._id }, { session });
    });
  } finally { await session.endSession(); }
  return { state, attachmentId: String(asset._id) };
}
