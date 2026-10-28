import Attachment from '../models/Attachment.js';
import { permanentlyDeleteAttachments } from '../services/attachmentDeletion.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';

export async function cleanupTrashedAttachments(retentionDays = 30) {
  const threshold = new Date(Date.now() - retentionDays * 86400000);
  const cursor = workspaceContext.runUnscoped(() => Attachment.find({ isDeleted: true, deletedAt: { $lte: threshold } }).select('_id workspaceId').cursor());
  for await (const asset of cursor) {
    await workspaceContext.run({ workspaceId: asset.workspaceId }, () => permanentlyDeleteAttachments([asset._id], { deletedBefore: threshold }));
  }
}
export const startTrashCleanup = () => {};
export const stopTrashCleanup = () => {};
export default { cleanupTrashedAttachments, startTrashCleanup, stopTrashCleanup };
