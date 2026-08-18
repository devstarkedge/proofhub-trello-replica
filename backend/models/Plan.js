import mongoose from 'mongoose';

/**
 * Platform-wide subscription tier catalog (Super Admin Dashboard). No
 * payment gateway is integrated anywhere in this codebase — a Super Admin
 * manually assigns a workspace's plan (see WorkspaceSubscription.js), so
 * this is genuinely persisted business data, not a fabricated display value.
 *
 * Not workspace-scoped (no workspaceScopePlugin) — this is a platform
 * catalog shared by every tenant, the same bucket as User/Workspace/Role's
 * global system-role templates.
 */
const planSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, trim: true, default: '' },
  // null = unlimited. Bytes for storage, matching Attachment.fileSize's unit.
  memberLimit: { type: Number, default: null, min: 0 },
  storageLimitBytes: { type: Number, default: null, min: 0 },
  projectLimit: { type: Number, default: null, min: 0 },
  priceCents: { type: Number, default: 0, min: 0 },
  isCustomPricing: { type: Boolean, default: false },
  billingCycleDefault: { type: String, enum: ['monthly', 'annual'], default: 'monthly' },
  features: [{ type: String, trim: true }],
  isActive: { type: Boolean, default: true },
  // false for the "Legacy" backfill tier — hidden from the Super Admin
  // assignment picker's default list so it's never chosen for a *new*
  // workspace, only ever set by the one-time pre-existing-workspace
  // migration (see scripts/migrateWorkspaceSubscriptions.js).
  isAssignableToNew: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false },
  sortOrder: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

planSchema.index({ isActive: 1, sortOrder: 1 });
planSchema.index({ isAssignableToNew: 1, isActive: 1, sortOrder: 1 });

export default mongoose.model('Plan', planSchema);
