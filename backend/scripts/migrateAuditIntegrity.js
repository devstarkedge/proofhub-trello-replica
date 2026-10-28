import mongoose from 'mongoose';
import VersionHistory from '../models/VersionHistory.js';
import VersionSequence from '../models/VersionSequence.js';
import RecurringTask from '../models/RecurringTask.js';
import RecurrenceOccurrence from '../models/RecurrenceOccurrence.js';
import Subtask from '../models/Subtask.js';
import FileDeletionJob from '../models/FileDeletionJob.js';
import RefreshSession from '../models/RefreshSession.js';
import OfflineMutationReceipt from '../models/OfflineMutationReceipt.js';
import Attachment from '../models/Attachment.js';
import AttachmentQuarantine from '../models/AttachmentQuarantine.js';
import { isAnnouncementAttachment } from './attachmentMigrationReferences.js';

export async function runAuditIntegrityMigration() {
  const duplicates = async (Model, match, key) => Model.collection.aggregate([
    { $match: match }, { $group: { _id: key, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $limit: 1 }
  ]).hasNext();
  if (await duplicates(VersionHistory, {}, { workspaceId: '$workspaceId', entityType: '$entityType', entityId: '$entityId', versionNumber: '$versionNumber' })) throw new Error('Duplicate history versions require reconciliation before adding the unique index. Preserve all version IDs and contents.');
  if (await duplicates(RecurringTask, { isActive: true }, { workspaceId: '$workspaceId', card: '$card' })) throw new Error('Multiple active schedules exist for a card. Review and deactivate superseded schedules before migrating.');
  if (await AttachmentQuarantine.collection.countDocuments({ state: { $nin: ['secured', 'missing_in_storage', 'metadata_only'] } })) throw new Error('An attachment quarantine is incomplete. Resume the explicit private-file quarantine migration before completing this migration.');
  for await (const asset of Attachment.collection.find({ deliveryType: { $ne: 'authenticated' } })) {
    if (!await isAnnouncementAttachment(asset)) throw new Error('Run scripts/migratePrivateAttachments.js --apply during maintenance before completing this migration.');
  }
  for (const collection of ['cards', 'subtasks', 'subtasknanos', 'comments']) if (await mongoose.connection.db.collection(collection).countDocuments({ 'attachments.url': /res\.cloudinary\.com\// })) throw new Error('Legacy embedded files still need scripts/migratePrivateAttachments.js --apply.');
  // Replace the previous non-unique history index without dropping data.
  const indexes = await VersionHistory.collection.indexes().catch(error => error.codeName === 'NamespaceNotFound' ? [] : Promise.reject(error));
  for (const index of indexes) if (!index.unique && JSON.stringify(index.key) === JSON.stringify({ workspaceId: 1, entityType: 1, entityId: 1, versionNumber: -1 })) await VersionHistory.collection.dropIndex(index.name);
  for (const Model of [VersionHistory, VersionSequence, RecurringTask, RecurrenceOccurrence, Subtask, FileDeletionJob, RefreshSession, OfflineMutationReceipt, AttachmentQuarantine]) await Model.createIndexes();
  for (const name of ['cards', 'subtasks', 'subtasknanos']) await mongoose.connection.db.collection(name).createIndex({ workspaceId: 1, board: 1, updatedAt: -1, _id: -1 });
  return { indexesCreated: true, historicalFinancialRowsChanged: 0 };
}
