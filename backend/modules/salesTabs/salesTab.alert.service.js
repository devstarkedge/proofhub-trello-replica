/**
 * SalesTab Alert Service
 *
 * DETECTION only — evaluates new/updated sales rows (and, on a schedule,
 * time-based conditions) against active watch tabs, and records a
 * normalized, idempotent SalesTabAlertEvent for every real transition.
 *
 * Deliberately does NOT deliver anything itself (no toast/notification/
 * email calls here) — that's salesTab.watchDelivery.service.js's job,
 * called by the worker after detection returns. Keeping detection and
 * delivery as separate modules (not just separate functions) means the
 * import graph itself enforces "Alert Detection separate from Alert
 * Delivery," not just convention.
 */
import SalesRow from '../../models/SalesRow.js';
import { buildSalesQuery } from '../../controllers/salesController.js';
import { getActiveWatchTabs, incrementUnread } from './salesTab.service.js';
import { emitSalesTabUnreadUpdate } from '../../realtime/emitters.js';
import SalesTabWatchState from './salesTabWatchState.model.js';
import SalesTabAlertEvent from './salesTabAlertEvent.model.js';
import { computeScheduledFor } from './salesTab.alertConfig.js';
import * as workspaceContext from '../workspaces/workspaceContext.js';

// ─── Alert Rule Condition Evaluation ────────────────────────────────────────

/**
 * Check if an alert rule condition is met for a row transition.
 * Exported so the baseline-reconciliation service can pre-evaluate the two
 * time-based conditions when seeding a new SalesTabWatchState doc.
 */
export function matchesAlertRule(rule, oldRow, newRow) {
  switch (rule.type) {
    case 'new_row':
      // Only applies to new row creation (oldRow is null)
      return oldRow === null;

    case 'status_changed':
      return oldRow && oldRow.status !== newRow.status;

    case 'budget_increased': {
      const oldBudget = parseBudget(oldRow?.clientBudget);
      const newBudget = parseBudget(newRow?.clientBudget);
      return oldBudget !== null && newBudget !== null && newBudget > oldBudget;
    }

    case 'rating_improved':
      return oldRow && (newRow.clientRating || 0) > (oldRow.clientRating || 0);

    case 'dead_to_active': {
      const deadStatuses = ['dead', 'lost', 'closed', 'rejected'];
      const activeStatuses = ['active', 'bid', 'in progress', 'won', 'replied'];
      const wasDeadStr = (oldRow?.status || '').toLowerCase();
      const isActiveStr = (newRow?.status || '').toLowerCase();
      return deadStatuses.some(s => wasDeadStr.includes(s)) &&
             activeStatuses.some(s => isActiveStr.includes(s));
    }

    case 'followup_overdue':
      if (!newRow.followUpDate) return false;
      return new Date(newRow.followUpDate) < new Date();

    case 'no_response_days': {
      const days = rule.config?.days || 7;
      if (!newRow.date) return false;
      const rowDate = new Date(newRow.date);
      const daysSince = (Date.now() - rowDate.getTime()) / (1000 * 60 * 60 * 24);
      const noResponse = !newRow.replyFromClient || newRow.replyFromClient === 'No Reply';
      return noResponse && daysSince >= days;
    }

    default:
      return false;
  }
}

function parseBudget(budget) {
  if (!budget) return null;
  const num = parseFloat(String(budget).replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
}

export function formatAlertMessage(ruleType, row) {
  const name = row.name || 'Unknown';
  const platform = row.platform || '';
  switch (ruleType) {
    case 'new_row':
      return `New matching record: ${name} on ${platform}`;
    case 'status_changed':
      return `Status changed for ${name}: ${row.status}`;
    case 'budget_increased':
      return `Budget increased for ${name}: ${row.clientBudget}`;
    case 'rating_improved':
      return `Rating improved for ${name}: ${row.clientRating}★`;
    case 'dead_to_active':
      return `Dead lead ${name} became active!`;
    case 'followup_overdue':
      return `Follow-up overdue for ${name}`;
    case 'no_response_days':
      return `No response from ${name} on ${platform}`;
    default:
      return `Alert triggered for ${name}`;
  }
}

function summarize(row) {
  return { id: row._id, name: row.name, platform: row.platform, technology: row.technology, status: row.status };
}

function extractValue(conditionType, row) {
  if (!row) return null;
  switch (conditionType) {
    case 'status_changed':
    case 'dead_to_active':
      return row.status;
    case 'budget_increased':
      return row.clientBudget;
    case 'rating_improved':
      return row.clientRating;
    case 'followup_overdue':
      return row.followUpDate;
    case 'no_response_days':
      return row.replyFromClient;
    default:
      return summarize(row);
  }
}

// ─── Event creation (idempotent) ────────────────────────────────────────────

/**
 * Builds the dedupeKey for a real transition. Event-driven conditions key
 * off the row's own updatedAt (ties the event to one specific row-version,
 * so a retried BullMQ job recomputing the same transition is a no-op, not
 * a duplicate). The two sweep-evaluated, time-based conditions key off the
 * SalesTabWatchState cycle counters instead (see that model's header
 * comment for why).
 */
function buildDedupeKey({ tab, row, conditionType, cycleSeq }) {
  if (conditionType === 'followup_overdue' || conditionType === 'no_response_days') {
    return `${tab._id}:${row._id}:${conditionType}:${cycleSeq}`;
  }
  const version = row.updatedAt ? new Date(row.updatedAt).toISOString() : Date.now().toString();
  return `${tab._id}:${row._id}:${conditionType}:${version}`;
}

/**
 * Idempotently records one detected transition. Returns the created event,
 * or null if this exact transition was already recorded (duplicate-key —
 * expected/harmless, e.g. on a BullMQ job retry).
 */
async function tryCreateEvent({ tab, row, conditionType, previousValue, currentValue, cycleSeq }) {
  const dedupeKey = buildDedupeKey({ tab, row, conditionType, cycleSeq });
  let event;
  try {
    event = await SalesTabAlertEvent.create({
      workspaceId: tab.workspaceId,
      savedTabId: tab._id,
      salesRowId: row._id,
      conditionType,
      recipientUserId: tab.ownerId,
      priority: tab.alertPriority,
      previousValue,
      currentValue,
      dedupeKey,
      scheduledFor: computeScheduledFor(tab.alertFrequency),
    });
  } catch (err) {
    if (err.code === 11000) return null; // already recorded — expected on retry
    throw err;
  }

  // Unread badge is a passive "you haven't reviewed this yet" UI indicator,
  // independent of which delivery channels are selected/succeed — updates
  // at detection time, matching the pre-existing UI behavior.
  try {
    const updatedTab = await incrementUnread(tab._id, 1);
    if (updatedTab) emitSalesTabUnreadUpdate(tab._id, updatedTab.unreadMatches);
  } catch (err) {
    console.error('[SalesAlert] unread badge update failed:', err.message);
  }

  return event;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Evaluate a newly created sales row against all active watch tabs.
 * Returns the array of newly created SalesTabAlertEvent docs (empty if
 * none matched or all were duplicates).
 */
export async function evaluateNewRow(row) {
  const watchTabs = await getActiveWatchTabs();
  if (watchTabs.length === 0) return [];

  const created = [];
  for (const tab of watchTabs) {
    try {
      if (!tab.alertRules.some((r) => r.type === 'new_row')) continue;

      const isMatching = await SalesRow.exists({ ...buildSalesQuery(tab.filters || {}), _id: row._id });
      if (!isMatching) continue;

      const event = await tryCreateEvent({
        tab, row, conditionType: 'new_row', previousValue: null, currentValue: extractValue('new_row', row),
      });
      if (event) created.push(event);

      await SalesTabWatchState.updateOne(
        { savedTabId: tab._id, salesRowId: row._id },
        { $set: { workspaceId: tab.workspaceId, matched: true, lastEvaluatedAt: new Date() } },
        { upsert: true }
      );
    } catch (err) {
      console.error(`[SalesAlert] evaluateNewRow tab ${tab._id} error:`, err.message);
    }
  }
  return created;
}

/**
 * Evaluate an updated sales row against all active watch tabs. Every
 * matched condition produces its own independent event (a single update
 * satisfying e.g. both status_changed and budget_increased yields two
 * events, not one) — each is already independently idempotent via its own
 * dedupeKey, so there's no correctness reason to cap it at one per tab.
 */
export async function evaluateRowUpdate(oldRow, newRow) {
  const watchTabs = await getActiveWatchTabs();
  if (watchTabs.length === 0) return [];

  const created = [];
  for (const tab of watchTabs) {
    try {
      const isMatching = await SalesRow.exists({ ...buildSalesQuery(tab.filters || {}), _id: newRow._id });
      const hasNewRowRule = tab.alertRules.some((r) => r.type === 'new_row');
      const hasOverdueRule = tab.alertRules.some((r) => r.type === 'followup_overdue');
      const hasNoResponseRule = tab.alertRules.some((r) => r.type === 'no_response_days');

      if (hasNewRowRule || hasOverdueRule || hasNoResponseRule) {
        const state = await SalesTabWatchState.findOneAndUpdate(
          { savedTabId: tab._id, salesRowId: newRow._id },
          { $setOnInsert: { workspaceId: tab.workspaceId } },
          { upsert: true, new: true }
        );

        if (hasNewRowRule) {
          if (!state.matched && isMatching) {
            const event = await tryCreateEvent({
              tab, row: newRow, conditionType: 'new_row', previousValue: null, currentValue: extractValue('new_row', newRow),
            });
            if (event) created.push(event);
            state.matched = true;
          } else if (state.matched && !isMatching) {
            state.matched = false; // left the result set — no alert, per product spec
          }
        }

        // Proactive reset — a resolved overdue/no-response condition
        // doesn't have to wait for the next hourly sweep to "notice."
        if (hasOverdueRule && state.overdueAlertedAt &&
            (!newRow.followUpDate || new Date(newRow.followUpDate) >= new Date())) {
          state.overdueAlertedAt = null;
          state.overdueCycleSeq += 1;
        }
        if (hasNoResponseRule && state.noResponseAlertedAt &&
            newRow.replyFromClient && newRow.replyFromClient !== 'No Reply') {
          state.noResponseAlertedAt = null;
          state.noResponseCycleSeq += 1;
        }
        state.lastEvaluatedAt = new Date();
        await state.save();
      }

      if (!isMatching) continue;

      for (const rule of tab.alertRules) {
        // new_row is handled above (transition-based); followup_overdue/
        // no_response_days are sweep-only (they need "is it STILL true right
        // now", not "did this update cause it", and re-evaluating them here
        // on every unrelated field edit would race the sweep's own dedup).
        if (['new_row', 'followup_overdue', 'no_response_days'].includes(rule.type)) continue;
        if (!matchesAlertRule(rule, oldRow, newRow)) continue;

        const event = await tryCreateEvent({
          tab, row: newRow, conditionType: rule.type,
          previousValue: extractValue(rule.type, oldRow), currentValue: extractValue(rule.type, newRow),
        });
        if (event) created.push(event);
      }
    } catch (err) {
      console.error(`[SalesAlert] evaluateRowUpdate tab ${tab._id} error:`, err.message);
    }
  }
  return created;
}

/**
 * Check all watch tabs for overdue follow-ups / no-response rules. Called
 * by the scheduled BullMQ repeatable job ('check-overdue-alerts').
 *
 * getActiveWatchTabs() is called cross-tenant here deliberately (this
 * function runs under workspaceContext.runUnscoped() so it can sweep every
 * workspace's due tabs in one job) — but every per-tab SalesRow query is
 * re-entered under workspaceContext.run({workspaceId: tab.workspaceId}),
 * closing the cross-tenant leak that existed before this rewrite (the old
 * implementation ran the entire sweep, including the row queries,
 * unscoped — matching rows from OTHER workspaces could satisfy a tab's
 * generic filter criteria and leak into its unread count/alerts).
 */
export async function evaluateOverdueAlerts() {
  const watchTabs = await getActiveWatchTabs();
  const overdueRuleTabs = watchTabs.filter((tab) =>
    tab.alertRules.some((r) => r.type === 'followup_overdue' || r.type === 'no_response_days')
  );
  if (overdueRuleTabs.length === 0) return [];

  const created = [];
  for (const tab of overdueRuleTabs) {
    try {
      await workspaceContext.run({ workspaceId: tab.workspaceId }, async () => {
        const rows = await SalesRow.find(buildSalesQuery(tab.filters || {})).lean();

        for (const row of rows) {
          for (const rule of tab.alertRules) {
            if (rule.type !== 'followup_overdue' && rule.type !== 'no_response_days') continue;
            if (!matchesAlertRule(rule, row, row)) continue;

            const marker = rule.type === 'followup_overdue' ? 'overdueAlertedAt' : 'noResponseAlertedAt';
            const seqField = rule.type === 'followup_overdue' ? 'overdueCycleSeq' : 'noResponseCycleSeq';

            const state = await SalesTabWatchState.findOneAndUpdate(
              { savedTabId: tab._id, salesRowId: row._id },
              { $setOnInsert: { workspaceId: tab.workspaceId } },
              { upsert: true, new: true }
            );
            if (state[marker]) continue; // already alerted this episode — this is what kills the flood

            const event = await tryCreateEvent({
              tab, row, conditionType: rule.type, previousValue: null,
              currentValue: extractValue(rule.type, row), cycleSeq: state[seqField],
            });
            if (event) {
              state[marker] = new Date();
              state.lastEvaluatedAt = new Date();
              await state.save();
              created.push(event);
            }
          }
        }
      });
    } catch (err) {
      console.error(`[SalesAlert] evaluateOverdueAlerts tab ${tab._id} error:`, err.message);
      // continue to next tab — one tab's failure must not block others
    }
  }
  return created;
}
