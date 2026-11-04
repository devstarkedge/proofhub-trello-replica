import { setAnnouncementReaction } from '../../shared/announcementState.mjs';

// Compare and swap only the reaction field. Seen/read updates cannot overwrite
// it, and simultaneous reactions retry against the committed version.
export async function writeAnnouncementReaction(Model, filter, emoji, userId, present) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const row = await Model.findOne(filter).select('reactions __v workspaceId subscribers createdBy').lean();
    if (!row) return null;
    const reactions = setAnnouncementReaction(row.reactions, emoji, userId, present);
    const result = await Model.updateOne({ ...filter, __v: row.__v ?? { $exists: false } }, {
      $set: { reactions }, $inc: { __v: 1 }
    });
    if (result.modifiedCount) return { ...row, reactions };
  }
  throw Object.assign(new Error('This announcement changed. Please try your reaction again.'), { statusCode: 409 });
}
