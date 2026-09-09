/**
 * SalesTab Watch-State Reconciliation
 *
 * Establishes/refreshes the SalesTabWatchState baseline for a watch tab —
 * called whenever a tab's matching-row set could have changed in a way
 * that would otherwise flood the user with false "new matching row"
 * alerts: watch turned on, or filters changed on an already-active watch
 * tab (see salesTab.service.js's createTab/updateTab call sites).
 *
 * Must run inside workspaceContext.run({ workspaceId: tab.workspaceId }) —
 * the caller's responsibility (enforced by whoever invokes this, either the
 * request-scoped service functions directly, or the queue job handler for
 * workers).
 */
import SalesRow from '../../models/SalesRow.js';
import { buildSalesQuery } from '../../controllers/salesController.js';
import { matchesAlertRule } from './salesTab.alert.service.js';
import SalesTabWatchState from './salesTabWatchState.model.js';

export async function reconcileWatchBaseline(tab) {
  const matchingRows = await SalesRow.find(buildSalesQuery(tab.filters || {}))
    .select('_id followUpDate replyFromClient date')
    .lean();
  const matchingIds = matchingRows.map((r) => r._id);

  const overdueRule = (tab.alertRules || []).find((r) => r.type === 'followup_overdue');
  const noResponseRule = (tab.alertRules || []).find((r) => r.type === 'no_response_days');

  if (matchingRows.length > 0) {
    await SalesTabWatchState.bulkWrite(
      matchingRows.map((row) => ({
        updateOne: {
          filter: { savedTabId: tab._id, salesRowId: row._id },
          update: {
            $set: { workspaceId: tab.workspaceId, matched: true, lastEvaluatedAt: new Date() },
            // Pre-seed the overdue/no-response dedup markers as if already
            // alerted, so a row that's already overdue/unresponded-to at
            // the moment watch turns on (or filters change to include it)
            // doesn't retroactively fire — matching the "don't flood on
            // first evaluation" requirement for new_row, extended to the
            // two time-based conditions for the same reason. Only pre-seeded
            // when the tab actually has that rule selected (otherwise left
            // null — harmless either way since the condition isn't evaluated
            // when not selected, but keeps the state doc's meaning honest).
            $setOnInsert: {
              overdueAlertedAt: overdueRule && matchesAlertRule(overdueRule, row, row) ? new Date() : null,
              noResponseAlertedAt: noResponseRule && matchesAlertRule(noResponseRule, row, row) ? new Date() : null,
              overdueCycleSeq: 0,
              noResponseCycleSeq: 0,
            },
          },
          upsert: true,
        },
      }))
    );
  }

  // Rows that no longer match this tab's (possibly just-changed) filters —
  // drop their state so any future re-entry starts a genuinely fresh
  // baseline rather than inheriting a stale cycle sequence.
  await SalesTabWatchState.deleteMany({
    savedTabId: tab._id,
    salesRowId: { $nin: matchingIds },
  });
}
