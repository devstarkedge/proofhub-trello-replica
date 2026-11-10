import { chatHooks } from '../../utils/chatHooks.js';
import { invalidateAuthCache } from '../../middleware/authMiddleware.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import logger from '../../utils/logger.js';

// Called only after a validated User write succeeds. Queue delivery, HMAC and
// retry policy stay in the existing Chat integration dispatcher.
export async function publishUserProfileUpdate(user, previous, actor, workspaceId) {
  invalidateAuthCache(user._id);
  const changes = {};
  for (const field of ['name', 'email', 'avatar']) {
    if (previous && previous[field] !== user[field]) {
      changes[field] = { old: previous[field], new: user[field] };
    }
  }

  if (!workspaceId) {
    const activeMemberships = await WorkspaceMembership.find({ user: user._id, status: 'active' }).distinct('workspace');
    if (!activeMemberships.length) return;
    for (const wsId of activeMemberships) {
      try {
        await chatHooks.onUserUpdated(user, changes, actor, wsId.toString());
      } catch (error) {
        logger.error('ChatApp profile update dispatch failed', {
          userId: user._id.toString(), workspaceId: wsId.toString(), error: error.message,
        });
      }
    }
    return;
  }

  try {
    await chatHooks.onUserUpdated(user, changes, actor, workspaceId);
  } catch (error) {
    logger.error('ChatApp profile update dispatch failed', {
      userId: user._id.toString(), workspaceId, error: error.message,
    });
  }
}
