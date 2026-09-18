import { chatHooks } from '../../utils/chatHooks.js';
import { invalidateAuthCache } from '../../middleware/authMiddleware.js';
import logger from '../../utils/logger.js';

// Called only after a validated User write succeeds. Queue delivery, HMAC and
// retry policy stay in the existing Chat integration dispatcher.
export async function publishUserProfileUpdate(user, previous, actor, workspaceId) {
  invalidateAuthCache(user._id);
  if (!workspaceId) return; // Platform accounts without a workspace have no Chat tenant.
  const changes = {};
  for (const field of ['name', 'email', 'avatar']) {
    if (previous[field] !== user[field]) changes[field] = { old: previous[field], new: user[field] };
  }
  // Publish the current snapshot on a retry even if the first request already
  // saved the name before delivery failed.
  try {
    await chatHooks.onUserUpdated(user, changes, actor, workspaceId);
  } catch (error) {
    logger.error('ChatApp profile update dispatch failed', {
      userId: user._id.toString(), workspaceId, error: error.message,
    });
    throw error;
  }
}
