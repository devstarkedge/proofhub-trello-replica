import mongoose from 'mongoose';
import Attachment from '../models/Attachment.js';
import Comment from '../models/Comment.js';
import { attachmentPath, stripMediaGrants } from './attachmentDelivery.js';

// A copy gets its own authorization reference while sharing immutable cloud
// bytes. The cleanup outbox retains the asset until its last reference is gone.
export async function copyTaskFiles(sourceType, sourceId, targetType, target, { comments = false, files: includeFiles = true, session = null } = {}) {
  const sourceField = { card: 'card', subtask: 'subtask', nano: 'nanoSubtask' }[sourceType];
  const targetField = { card: 'card', subtask: 'subtask', nano: 'nanoSubtask' }[targetType];
  const sourceMatch = { [sourceField]: sourceId, isDeleted: false, ...(sourceType === 'card' ? { subtask: null, nanoSubtask: null } : sourceType === 'subtask' ? { nanoSubtask: null } : {}) };
  const files = includeFiles ? await Attachment.find(sourceMatch).session(session).lean() : [];
  const replacements = new Map();
  for (const file of files) {
    const id = new mongoose.Types.ObjectId(), stable = attachmentPath(id);
    const { _id, card, subtask, nanoSubtask, comment, createdAt, updatedAt, __v, ...data } = file;
    await Attachment.create([{ ...data, _id: id, board: target.board, [targetField]: target._id, contextType: targetType === 'nano' ? 'nanoSubtask' : targetType, contextRef: target._id, url: stable, secureUrl: stable, thumbnailUrl: stable, previewUrl: stable, isCover: false }], { session });
    for (const url of [attachmentPath(file._id), file.url, file.secureUrl, file.thumbnailUrl, file.previewUrl].filter(Boolean)) replacements.set(url, stable);
  }
  const rewrite = value => {
    if (typeof value !== 'string') return value;
    let result = stripMediaGrants(value);
    for (const [before, after] of replacements) result = result.split(before).join(after);
    return result;
  };
  target.description = rewrite(target.description);
  for (const file of target.attachments || []) file.url = rewrite(file.url);
  await target.save({ session });
  if (comments) {
    const originals = await Comment.find({ contextRef: sourceId, contextType: sourceType === 'nano' ? 'subtaskNano' : sourceType }).session(session).lean();
    for (const original of originals) {
      const { _id, createdAt, updatedAt, __v, ...data } = original;
      await Comment.create([{ ...data, card: targetType === 'card' ? target._id : target.task, board: target.board, contextRef: target._id, contextType: targetType === 'nano' ? 'subtaskNano' : targetType, htmlContent: rewrite(original.htmlContent), attachments: includeFiles ? (original.attachments || []).map(file => ({ ...file, url: rewrite(file.url) })) : [], editHistory: [], isEdited: false, replyCount: 0, reactions: [], isPinned: false }], { session });
    }
  }
  return rewrite;
}
