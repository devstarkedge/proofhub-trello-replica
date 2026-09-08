/**
 * Notification Decision Engine
 *
 * The single call path every notification producer should use instead of
 * scattering "is this user still a member / can they see this entity"
 * checks across controllers, and instead of calling the in-app and Slack
 * channels through two independent, inconsistent code paths.
 *
 * This is deliberately thin — it does NOT reimplement preference/quiet-hours/
 * batching/threading logic that already exists and works:
 *   - notificationService.createNotification() already gates on
 *     User.settings.notifications (shouldSendNotification) and fans out to
 *     email/push — reused unchanged.
 *   - slackNotificationService.sendNotification() already gates on
 *     SlackUser.preferences (shouldReceiveNotification), quiet hours,
 *     batching, threading, channel routing, and records delivery — reused
 *     unchanged.
 *
 * What this module actually adds, once, for every producer:
 *   1. Recipient workspace-membership verification (a queued/deferred
 *      notification must not fire for a user who has since left the
 *      workspace).
 *   2. Recipient entity-access verification (a mentioned user with no
 *      access to the board/task must not be notified).
 *   3. One call site for producers instead of two (in-app + Slack).
 *
 * Callers running inside a background worker (no ambient workspace
 * context) don't need to pre-wrap the call themselves — this module
 * establishes workspaceContext.run({ workspaceId }) around both channel
 * calls, since Notification/Card/Board etc. are workspaceScopePlugin'd and
 * require it.
 */
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import notificationService from '../../utils/notificationService.js';
import slackNotificationService from '../slack/SlackNotificationService.js';
import { userCanAccessEntity } from '../../utils/entityAccess.js';
import logger from '../../utils/logger.js';
import * as workspaceContext from '../../modules/workspaces/workspaceContext.js';

/**
 * @param {object} params
 * @param {string} params.type - canonical notification type (Notification enum value)
 * @param {string|ObjectId} params.workspaceId - required, the FlowTask workspace this event belongs to
 * @param {string|ObjectId} params.recipientUserId - required
 * @param {string|ObjectId} [params.actorUserId] - the user who caused the event, if any
 * @param {{type: string, id: string|ObjectId}} [params.entity] - notification's target entity, for access verification
 * @param {string} params.title - in-app notification title
 * @param {string} params.message - in-app notification message
 * @param {object} [params.metadata] - extra fields merged into the in-app Notification doc (priority, relatedBoard, relatedCard, action, ...)
 * @param {{inApp?: boolean, slack?: boolean}} [params.channels] - which channels to attempt (default: both)
 * @param {object} [params.slackPayload] - extra fields passed through verbatim to slackNotificationService.sendNotification (task, board, comment, priority, changes, oldStatus, newStatus, subtask, team, announcement, reminder, attachment, customMessage, forceImmediate)
 * @param {boolean} [params.notifySelf] - if true, still notifies when actorUserId === recipientUserId (default: false, matching existing producer convention of not notifying users about their own actions)
 */
export async function evaluateAndDeliver({
  type,
  workspaceId,
  recipientUserId,
  actorUserId = null,
  entity = null,
  title,
  message,
  metadata = {},
  channels = { inApp: true, slack: true },
  slackPayload = {},
  notifySelf = false,
}) {
  if (!type || !workspaceId || !recipientUserId) {
    return { delivered: false, reason: 'invalid_event' };
  }

  if (!notifySelf && actorUserId && actorUserId.toString() === recipientUserId.toString()) {
    return { delivered: false, reason: 'self_actor' };
  }

  const membership = await WorkspaceMembership.findOne({
    user: recipientUserId,
    workspace: workspaceId,
    status: 'active',
  }).select('_id').lean();

  if (!membership) {
    return { delivered: false, reason: 'not_a_member' };
  }

  if (entity?.type && entity?.id) {
    const hasAccess = await userCanAccessEntity({
      userId: recipientUserId,
      entityType: entity.type,
      entityId: entity.id,
    });
    if (!hasAccess) {
      return { delivered: false, reason: 'no_entity_access' };
    }
  }

  return workspaceContext.run({ workspaceId }, async () => {
    const results = {};

    if (channels.inApp !== false) {
      try {
        results.inApp = await notificationService.createNotification({
          type,
          title,
          message,
          user: recipientUserId,
          sender: actorUserId,
          entityId: entity?.id,
          entityType: entity?.type,
          ...metadata,
        });
      } catch (err) {
        logger.error(`[NotificationDecisionEngine] in-app delivery failed for ${type}`, { error: err.message });
        results.inApp = null;
      }
    }

    if (channels.slack !== false) {
      try {
        results.slack = await slackNotificationService.sendNotification({
          userId: recipientUserId,
          type,
          workspaceId,
          triggeredBy: actorUserId,
          ...slackPayload,
        });
      } catch (err) {
        logger.error(`[NotificationDecisionEngine] slack delivery failed for ${type}`, { error: err.message });
        results.slack = null;
      }
    }

    return { delivered: true, results };
  });
}

/**
 * Fan out the same event to multiple recipients. Failures for one
 * recipient never block delivery to the others.
 */
export async function evaluateAndDeliverBulk(recipientUserIds, payloadWithoutRecipient) {
  const ids = Array.from(new Set((recipientUserIds || []).map(id => (id?._id || id)?.toString()).filter(Boolean)));
  return Promise.allSettled(
    ids.map(recipientUserId => evaluateAndDeliver({ ...payloadWithoutRecipient, recipientUserId }))
  );
}
