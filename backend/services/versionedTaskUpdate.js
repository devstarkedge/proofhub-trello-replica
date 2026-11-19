import mongoose from 'mongoose';
import { ErrorResponse } from '../middleware/errorHandler.js';
import VersionHistory from '../models/VersionHistory.js';

// The entity patch and its old-description snapshot commit together.
export async function versionedTaskUpdate(Model, { entityId, updates, previous, entityType, actorId, populate, expectedRevision }) {
  const changed = updates.description !== undefined && updates.description !== previous.description;
  const filter = changed ? { _id: entityId, description: previous.description } : { _id: entityId };
  const update = session => Model.findOneAndUpdate(filter, updates, {
    returnDocument: 'after', runValidators: true, expectedRevision, ...(session ? { session } : {})
  }).populate(populate);
  if (!changed) return update();
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await update(session);
      if (!result) throw new ErrorResponse('The description changed. Reload it before saving.', 409);
      const html = previous.description || '';
      await VersionHistory.createVersion({
        entityType, entityId, content: html.replace(/<[^>]+>/g, '').trim() || '(empty)',
        htmlContent: html, editedBy: actorId, card: previous.task, board: previous.board, changeType: 'edited'
      }, { session });
    });
    return result;
  } finally { await session.endSession(); }
}
