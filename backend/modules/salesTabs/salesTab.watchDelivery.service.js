/**
 * SalesTab Watch Alert — Delivery
 *
 * The single delivery pipeline used for BOTH instant (synchronous, called
 * right after detection) and batched (picked up by the periodic sweep)
 * delivery — one code path interprets frequency/channels, so "Alert
 * Detection separate from Alert Delivery... do not allow different
 * services to interpret frequency differently" holds structurally, not
 * just by convention.
 *
 * Every call reloads the LATEST SalesTab config and re-verifies the
 * recipient's workspace membership — a pending event created 10 minutes
 * ago must reflect whatever the user changed in the meantime (watch
 * disabled, condition unchecked, channel unchecked, tab deleted, creator
 * removed from workspace), never the state at detection time.
 */
import SalesTab from './salesTab.model.js';
import SalesRow from '../../models/SalesRow.js';
import SalesTabAlertEvent from './salesTabAlertEvent.model.js';
import { buildSalesQuery } from '../../controllers/salesController.js';
import { formatAlertMessage } from './salesTab.alert.service.js';
import { emitSalesTabAlert } from '../../realtime/emitters.js';
import notificationService from '../../utils/notificationService.js';
import { enqueueEmail } from '../../queues/index.js';
import { buildSalesWatchDigestEmail } from '../../utils/email.js';
import { normalizePriority } from '../../utils/notificationPriority.js';
import User from '../../models/User.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import * as workspaceContext from '../workspaces/workspaceContext.js';
import { DELIVERY_SWEEP_BATCH_SIZE, MAX_DELIVERY_RETRIES } from './salesTab.alertConfig.js';

function groupBy(items, key) {
  const map = new Map();
  for (const item of items) {
    const k = String(item[key]);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

async function markSkipped(event, reason) {
  event.status = 'skipped';
  event.skipReason = reason;
  await SalesTabAlertEvent.updateOne(
    { _id: event._id },
    { $set: { status: 'skipped', skipReason: reason } }
  );
}

async function finalizeEvent(event, requestedChannelCount) {
  const delivered = event._deliveredSoFar || [];
  if (delivered.length > 0) {
    await SalesTabAlertEvent.updateOne(
      { _id: event._id },
      {
        $set: {
          status: 'delivered',
          deliveredAt: new Date(),
          deliveredChannels: delivered,
          lastError: event.lastError || undefined,
        },
      }
    );
    return;
  }

  const nextRetryCount = (event.retryCount || 0) + 1;
  if (requestedChannelCount === 0) {
    // Nothing was actually requested to deliver through (shouldn't normally
    // reach here — DELIVERY_DISABLED is caught earlier — but guard anyway).
    await markSkipped(event, 'DELIVERY_DISABLED');
    return;
  }
  if (nextRetryCount > MAX_DELIVERY_RETRIES) {
    await SalesTabAlertEvent.updateOne(
      { _id: event._id },
      { $set: { status: 'skipped', skipReason: null, lastError: event.lastError, retryCount: nextRetryCount } }
    );
    return;
  }
  const backoffMinutes = Math.min(15, 2 ** nextRetryCount);
  await SalesTabAlertEvent.updateOne(
    { _id: event._id },
    {
      $set: {
        retryCount: nextRetryCount,
        scheduledFor: new Date(Date.now() + backoffMinutes * 60 * 1000),
        lastError: event.lastError,
      },
    }
  );
}

/**
 * Delivers a batch of SalesTabAlertEvent docs. All events must belong to
 * the SAME workspace (caller's responsibility — the sweep groups by
 * workspaceId before calling this, and instant delivery is naturally
 * single-workspace since it's called from within a single row's own
 * workspace context).
 */
export async function deliverAlertEvents(events) {
  const pendingEvents = events.filter((e) => e.status !== 'skipped' && e.status !== 'delivered');
  const groups = groupBy(pendingEvents, 'savedTabId');

  for (const [, groupEvents] of groups) {
    const tab = await SalesTab.findById(groupEvents[0].savedTabId).lean();

    if (!tab) {
      for (const event of groupEvents) await markSkipped(event, 'TAB_DELETED');
      continue;
    }
    if (!tab.isWatchTab) {
      for (const event of groupEvents) await markSkipped(event, 'WATCH_DISABLED');
      continue;
    }
    if (String(tab.workspaceId) !== String(groupEvents[0].workspaceId)) {
      for (const event of groupEvents) await markSkipped(event, 'TAB_NOT_IN_WORKSPACE');
      continue;
    }

    const membership = await WorkspaceMembership.findOne({
      workspace: tab.workspaceId,
      user: tab.ownerId,
      status: 'active',
    }).lean();
    if (!membership) {
      for (const event of groupEvents) await markSkipped(event, 'CREATOR_NOT_IN_WORKSPACE');
      continue;
    }

    if (!tab.alertChannels || tab.alertChannels.length === 0) {
      for (const event of groupEvents) await markSkipped(event, 'DELIVERY_DISABLED');
      continue;
    }

    const recipientUser = await User.findById(tab.ownerId).select('email settings name').lean();

    const eligibleEvents = [];
    for (const event of groupEvents) {
      if (!tab.alertRules.some((r) => r.type === event.conditionType)) {
        await markSkipped(event, 'CONDITION_DISABLED');
        continue;
      }
      const stillMatches = await SalesRow.exists({ ...buildSalesQuery(tab.filters || {}), _id: event.salesRowId });
      if (!stillMatches) {
        await markSkipped(event, 'RECORD_NOT_MATCHING');
        continue;
      }
      eligibleEvents.push(event);
    }
    if (eligibleEvents.length === 0) continue;

    const rows = await SalesRow.find({ _id: { $in: eligibleEvents.map((e) => e.salesRowId) } }).lean();
    const rowById = new Map(rows.map((r) => [String(r._id), r]));

    for (const event of eligibleEvents) {
      const row = rowById.get(String(event.salesRowId));
      event._deliveredSoFar = [];
      if (!row) {
        await markSkipped(event, 'RECORD_NOT_MATCHING');
        continue;
      }

      const message = formatAlertMessage(event.conditionType, row);

      if (tab.alertChannels.includes('in_app')) {
        try {
          emitSalesTabAlert(tab.ownerId, {
            tabId: tab._id,
            tabName: tab.name,
            ruleType: event.conditionType,
            message,
            priority: tab.alertPriority,
            rowId: row._id,
            timestamp: new Date().toISOString(),
          });
          event._deliveredSoFar.push('in_app');
        } catch (err) {
          event.lastError = `in_app: ${err.message}`;
        }
      }

      if (tab.alertChannels.includes('notification_center')) {
        try {
          await notificationService.createNotification({
            type: 'sales_tab_alert',
            title: `Watch Tab: ${tab.name}`,
            message,
            user: tab.ownerId,
            entityId: tab._id,
            entityType: 'SalesTab',
            priority: normalizePriority(tab.alertPriority),
            metadata: { tabId: tab._id, conditionType: event.conditionType, rowId: row._id },
          });
          event._deliveredSoFar.push('notification_center');
        } catch (err) {
          event.lastError = `notification_center: ${err.message}`;
        }
      }

      event._pendingEmail = tab.alertChannels.includes('email');
    }

    // ── Email: one digest per (tab, recipient) covering every eligible,
    //    still-pending event in this group. ──
    const emailEligible = eligibleEvents.filter((e) => e.status !== 'skipped' && e._pendingEmail);
    if (emailEligible.length > 0) {
      if (!recipientUser?.email || recipientUser.settings?.notifications?.email === false) {
        emailEligible.forEach((e) => { e.lastError = e.lastError || 'email: NO_EMAIL'; });
      } else {
        try {
          const items = emailEligible
            .map((e) => {
              const row = rowById.get(String(e.salesRowId));
              if (!row) return null;
              return {
                message: formatAlertMessage(e.conditionType, row),
                conditionType: e.conditionType,
                rowName: row.name || 'Unknown',
                rowPlatform: row.platform || '',
              };
            })
            .filter(Boolean);
          await enqueueEmail(buildSalesWatchDigestEmail(recipientUser, { tab, items }));
          emailEligible.forEach((e) => e._deliveredSoFar.push('email'));
        } catch (err) {
          emailEligible.forEach((e) => { e.lastError = `email: ${err.message}`; });
        }
      }
    }

    for (const event of eligibleEvents) {
      await finalizeEvent(event, tab.alertChannels.length);
    }
  }
}

/**
 * Periodic sweep — picks up every due, still-pending SalesTabAlertEvent
 * across every workspace, groups by workspace (to establish correct
 * ambient scope) then by tab (for batched delivery), and delivers. Also
 * doubles as the retry mechanism for events whose earlier delivery attempt
 * failed (they remain `pending` with a bumped `scheduledFor`).
 */
export async function deliverPendingAlertsSweep() {
  for (let iteration = 0; iteration < 10; iteration++) {
    const due = await workspaceContext.runUnscoped(() =>
      SalesTabAlertEvent.find({ status: 'pending', scheduledFor: { $lte: new Date() } })
        .sort({ scheduledFor: 1 })
        .limit(DELIVERY_SWEEP_BATCH_SIZE)
        .lean()
    );
    if (due.length === 0) break;

    const byWorkspace = groupBy(due, 'workspaceId');
    for (const [workspaceId, events] of byWorkspace) {
      try {
        await workspaceContext.run({ workspaceId }, () => deliverAlertEvents(events));
      } catch (err) {
        console.error(`[SalesAlert] deliverPendingAlertsSweep workspace ${workspaceId} error:`, err.message);
      }
    }

    if (due.length < DELIVERY_SWEEP_BATCH_SIZE) break; // drained
  }
}
