import Notification from '../models/Notification.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import { runUnscoped, run } from '../modules/workspaces/workspaceContext.js';
import { emitNotification } from './emitters.js';
import { userCanAccessEntity } from '../utils/entityAccess.js';
import logger from '../utils/logger.js';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';

let timer, running = false;
export async function publishPendingNotifications() {
  if (running) return;
  running = true;
  try {
    for (let index = 0; index < 100; index++) {
      // An expiring atomic lease allows multiple publishers and crash recovery.
      const record = await runUnscoped(async () => await Notification.findOneAndUpdate({
        deliveryPending: true, $or: [{ deliveryLeaseUntil: null }, { deliveryLeaseUntil: { $lt: new Date() } }],
      }, { $set: { deliveryLeaseUntil: new Date(Date.now() + 30000) } }, { new: true }).sort({ createdAt: 1 }).lean());
      if (!record) break;
      await run({ workspaceId: record.workspaceId }, async () => {
        const member = await WorkspaceMembership.exists({ workspace: record.workspaceId, user: record.user, status: 'active', kind: { $ne: 'guest' } });
        const entityAllowed = record.type.endsWith('_deleted') ||
          await userCanAccessEntity({ userId: record.user, entityType: record.entityType, entityId: record.entityId });
        const active = await User.exists({ _id: record.user, isActive: true }) && await Workspace.exists({ _id: record.workspaceId, isActive: true });
        if (member && entityAllowed && active) {
          const populated = await Notification.findById(record._id).populate('sender', 'name avatar').populate('relatedCard', 'title').populate('relatedBoard', 'name').lean();
          if (populated) emitNotification(String(record.user), populated);
        }
        await Notification.updateOne({ _id: record._id }, { $set: { deliveryPending: false, deliveryLeaseUntil: null } });
      });
    }
  } catch (error) {
    logger.warn('Notification publication retry deferred', { code: error.code || error.name });
  } finally { running = false; }
}
export function startNotificationPublication() {
  if (!timer) { timer = setInterval(publishPendingNotifications, 5000); timer.unref(); }
}
export function stopNotificationPublication() { clearInterval(timer); timer = null; }
