/**
 * SalesTab Model
 *
 * Represents a saved custom tab (view) in the Sales module.
 * Stores filter snapshots, column configurations, alert rules,
 * and ownership/approval metadata.
 */
import mongoose from 'mongoose';
import crypto from 'crypto';

const { Schema, model, Types } = mongoose;

// ─── Alert Rule Sub-Schema ──────────────────────────────────────────────────
const alertRuleSchema = new Schema(
  {
    type: {
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
    config: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

// ─── Main Schema ────────────────────────────────────────────────────────────
const salesTabSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Tab name is required'],
      trim: true,
      maxlength: [30, 'Tab name cannot exceed 30 characters'],
    },

    // ── Filter Snapshot ──────────────────────────────────────────────────
    filters: { type: Schema.Types.Mixed, default: {} },
    columns: { type: [String], default: [] },
    sorting: {
      sortBy: { type: String, default: 'date' },
      sortOrder: { type: String, enum: ['asc', 'desc'], default: 'desc' },
    },
    search: { type: String, default: '' },
    density: {
      type: String,
      enum: ['compact', 'default', 'comfortable'],
      default: 'default',
    },
    frozenColumns: { type: [String], default: [] },

    // ── Ownership ────────────────────────────────────────────────────────
    ownerId: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    ownerName: { type: String, required: true },

    // ── Visibility & Approval ────────────────────────────────────────────
    visibility: {
      type: String,
      enum: ['private', 'public'],
      default: 'private',
      index: true,
    },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'ignored'],
      default: 'approved',
      index: true,
    },
    approvedBy: { type: Types.ObjectId, ref: 'User' },

    // ── Display ──────────────────────────────────────────────────────────
    isPinned: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },

    // ── Watch / Alert ────────────────────────────────────────────────────
    isWatchTab: { type: Boolean, default: false, index: true },
    alertRules: { type: [alertRuleSchema], default: [] },
    alertFrequency: {
      type: String,
      enum: ['instant', '15min', 'hourly', 'daily'],
      default: 'instant',
    },
    alertChannels: {
      type: [String],
      enum: ['in_app', 'notification_center', 'email'],
      default: ['in_app', 'notification_center'],
    },
    alertPriority: {
      type: String,
      enum: ['low', 'medium', 'urgent'],
      default: 'medium',
    },
    unreadMatches: { type: Number, default: 0 },
    lastAlertAt: { type: Date },

    // ── Dedup / Optimization ─────────────────────────────────────────────
    filterHash: { type: String, index: true },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ────────────────────────────────────────────────────────────────
salesTabSchema.index({ ownerId: 1, name: 1 }, { unique: true });
salesTabSchema.index({ ownerId: 1, visibility: 1, approvalStatus: 1 });
salesTabSchema.index({ isWatchTab: 1, approvalStatus: 1 });
salesTabSchema.index({ createdAt: -1 });

// ─── Pre-save: auto-compute filterHash ──────────────────────────────────────
salesTabSchema.pre('save', function (next) {
  if (this.isModified('filters') || this.isNew) {
    this.filterHash = computeFilterHash(this.filters);
  }
  // Auto-approve private tabs
  if (this.isNew && this.visibility === 'private') {
    this.approvalStatus = 'approved';
  }
  next();
});

// ─── Helpers ────────────────────────────────────────────────────────────────
function computeFilterHash(filters) {
  const serialized = JSON.stringify(filters || {}, Object.keys(filters || {}).sort());
  return crypto.createHash('sha256').update(serialized).digest('hex').slice(0, 16);
}

const SalesTab = model('SalesTab', salesTabSchema);

export default SalesTab;
export { computeFilterHash };
