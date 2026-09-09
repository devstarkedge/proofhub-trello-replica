/**
 * SalesTabWatchState
 *
 * Per-(savedTab, salesRow) baseline/dedup state for the watch-alert engine.
 * Exists to solve two problems that would otherwise flood the user:
 *
 * 1. "New matching row added" must fire only on a genuine not-matching ->
 *    matching transition — `matched` is the baseline flag that lets the
 *    engine tell "this row already matched before I started watching /
 *    before the filters last changed" apart from "this row just started
 *    matching."
 * 2. "Follow-up overdue" / "No response for X days" are evaluated by a
 *    periodic sweep (salesTab.alert.service.js#evaluateOverdueAlerts), not
 *    a one-time event — without a dedup marker the same still-overdue row
 *    would re-alert on every sweep cycle forever. `overdueAlertedAt`/
 *    `noResponseAlertedAt` record "already alerted for the CURRENT
 *    overdue/no-response episode"; they reset to null when the underlying
 *    condition resolves (follow-up date pushed to the future, or a reply
 *    is recorded), so a later recurrence of the same condition is treated
 *    as a fresh episode.
 *
 * The `*CycleSeq` counters exist because no field on SalesRow records
 * "since when has this been overdue *this time*" — replyFromClient/
 * followUpDate are just current-state fields, not episode timestamps — so
 * the counter gives each alertable episode a stable identity for the
 * SalesTabAlertEvent dedupeKey without inventing a new timestamp on
 * SalesRow itself.
 */
import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

const { Schema, Types, model } = mongoose;

const salesTabWatchStateSchema = new Schema(
  {
    workspaceId: { type: Types.ObjectId, ref: 'Workspace', required: true, index: true },
    savedTabId: { type: Types.ObjectId, ref: 'SalesTab', required: true },
    salesRowId: { type: Types.ObjectId, ref: 'SalesRow', required: true },

    // Baseline for the new_row-on-update transition (not-matching -> matching).
    matched: { type: Boolean, default: false },

    // Dedup markers for the two sweep-evaluated, time-based conditions.
    overdueAlertedAt: { type: Date, default: null },
    overdueCycleSeq: { type: Number, default: 0 },
    noResponseAlertedAt: { type: Date, default: null },
    noResponseCycleSeq: { type: Number, default: 0 },

    lastEvaluatedAt: { type: Date },
  },
  { timestamps: true }
);

salesTabWatchStateSchema.index({ savedTabId: 1, salesRowId: 1 }, { unique: true });
salesTabWatchStateSchema.index({ workspaceId: 1, savedTabId: 1 });
salesTabWatchStateSchema.index({ salesRowId: 1 });

salesTabWatchStateSchema.plugin(workspaceScopePlugin);

const SalesTabWatchState = model('SalesTabWatchState', salesTabWatchStateSchema);

export default SalesTabWatchState;
