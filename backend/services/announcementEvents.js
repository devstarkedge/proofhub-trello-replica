import { announcementAudience, workspaceMemberIds } from './workspaceAudience.js';
import { emitToUser } from '../realtime/emitters.js';
export async function emitAnnouncementEvent(announcement, event, payload) {
  const workspaceId = announcement.workspaceId;
  const subscribers = await announcementAudience(announcement.subscribers, workspaceId);
  const creator = await workspaceMemberIds({ user: announcement.createdBy?._id || announcement.createdBy }, workspaceId);
  for (const userId of [...new Set([...subscribers, ...creator].map(String))]) emitToUser(userId, event, payload, workspaceId);
}
