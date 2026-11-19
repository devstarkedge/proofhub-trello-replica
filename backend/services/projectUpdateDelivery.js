import notificationService from '../utils/notificationService.js';
import { slackHooks } from '../utils/slackHooks.js';
import { getActiveWorkspaceId } from '../modules/workspaces/workspaceContext.js';

export async function deliverProjectUpdate({ workspaceId, board, updaterId, changes, channel }) {
  if (!workspaceId || String(getActiveWorkspaceId()) !== String(workspaceId) || String(board?.workspaceId) !== String(workspaceId)) {
    throw new Error('Project update delivery requires its originating workspace');
  }
  // Existing delivery services recheck current membership and project access.
  if (channel === 'inApp') return notificationService.notifyProjectUpdated(board, updaterId, changes.slice(0, 3).join(', '));
  if (channel === 'slack') return slackHooks.onProjectUpdated(board, changes, { _id:updaterId, id:updaterId });
  throw new Error('Unknown project update delivery channel');
}
