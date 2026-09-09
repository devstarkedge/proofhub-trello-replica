/**
 * SalesTabAlertEvent
 *
 * One document per REAL detected watch-alert transition (not per delivery
 * attempt). This is the normalized event the centralized delivery pipeline
 * (salesTab.watchDelivery.service.js) consumes: detection writes it once,
 * idempotently (via the unique `dedupeKey`); delivery reloads the tab's
 * LATEST configuration at send time and marks the event delivered/skipped
 * accordingly — detection and delivery are deliberately decoupled so a
 * frequency change or a disabled channel between detection and the
 * scheduled delivery time is always honored.
 *
 * `status` has 3 values, not 4: total-channel-failure doesn't get its own
 * terminal `failed` state — it stays `pending` with a bumped `scheduledFor`
 * (capped exponential backoff) so the next delivery sweep retries it, and
 * only becomes a terminal `skipped` (skipReason left null, `lastError`
 * populated) after MAX_DELIVERY_RETRIES is exceeded. This reuses the sweep
 * itself as the retry mechanism instead of a second one.
 */
import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

const { Schema, Types, model } = mongoose;

const salesTabAlertEventSchema = new Schema(
  {
    workspaceId: { type: Types.ObjectId, ref: 'Workspace', required: true, index: true },
    savedTabId: { type: Types.ObjectId, ref: 'SalesTab', required: true, index: true },
    salesRowId: { type: Types.ObjectId, ref: 'SalesRow', required: true, index: true },

    conditionType: {
      type: String,
      required: true,
      enum: [
        'new_row',
        'status_changed',
        'budget_increased',
        'rating_improved',
        'dead_to_active',
        'followup_overdue',
        'no_response_days',
      ],
    },

    // Snapshots for audit only — delivery re-verifies against the LIVE tab,
    // never trusts these for authorization/eligibility decisions.
    recipientUserId: { type: Types.ObjectId, ref: 'User', required: true },
    priority: { type: String, enum: ['low', 'medium', 'urgent'] },
    previousValue: { type: Schema.Types.Mixed },
    currentValue: { type: Schema.Types.Mixed },

    detectedAt: { type: Date, required: true, default: Date.now },
    dedupeKey: { type: String, required: true, unique: true },

    status: { type: String, enum: ['pending', 'delivered', 'skipped'], default: 'pending', index: true },
    scheduledFor: { type: Date, required: true, index: true },
    deliveredAt: { type: Date },
    deliveredChannels: { type: [String], enum: ['in_app', 'notification_center', 'email'], default: [] },
    skipReason: {
      type: String,
      enum: [
        'WATCH_DISABLED', 'CONDITION_DISABLED', 'TAB_DELETED', 'TAB_NOT_IN_WORKSPACE',
        'CREATOR_NOT_IN_WORKSPACE', 'CREATOR_NO_ACCESS', 'RECORD_NOT_MATCHING',
        'DUPLICATE', 'DELIVERY_DISABLED', 'NO_EMAIL', 'STALE_EVENT', null,
      ],
      default: null,
    },
    retryCount: { type: Number, default: 0 },
    lastError: { type: String, maxlength: 500 },
  },
  { timestamps: true }
);

salesTabAlertEventSchema.index({ status: 1, scheduledFor: 1 });
salesTabAlertEventSchema.index({ savedTabId: 1, status: 1 });

salesTabAlertEventSchema.plugin(workspaceScopePlugin);

const SalesTabAlertEvent = model('SalesTabAlertEvent', salesTabAlertEventSchema);

export default SalesTabAlertEvent;
