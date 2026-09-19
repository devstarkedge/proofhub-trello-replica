import Announcement from '../models/Announcement.js';

/**
 * Persist broadcast metadata without saving a potentially stale Mongoose
 * document. Realtime recipients can update seen/read arrays as soon as an
 * announcement is emitted, which makes a later document.save() race on __v.
 */
export async function persistAnnouncementBroadcastState(
  announcement,
  subscriberIds,
  { scheduled = false } = {},
) {
  const broadcastState = {
    broadcastedAt: new Date(),
    broadcastedTo: Array.isArray(subscriberIds) ? subscriberIds : [],
  };
  if (scheduled) broadcastState.scheduleBroadcasted = true;

  const result = await Announcement.updateOne(
    { _id: announcement._id },
    { $set: broadcastState },
  );
  if (result.matchedCount !== 1) {
    throw new Error(
      `Announcement ${announcement._id} disappeared before broadcast state was persisted`,
    );
  }

  // Keep the response/socket payload in sync with the atomic database write.
  // This only updates the in-memory object; callers must not save it again.
  if (typeof announcement.set === 'function') {
    announcement.set(broadcastState);
  } else {
    Object.assign(announcement, broadcastState);
  }

  return broadcastState;
}
