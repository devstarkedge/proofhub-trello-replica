import mongoose from 'mongoose';

/**
 * Platform-level audit trail for Super Admin Dashboard actions — a separate
 * collection from the existing, customer-facing backend/models/AuditLog.js,
 * not an extension of it. Two reasons:
 *
 *  1. AuditLog.workspace is `required: true` and every one of its compound
 *     indexes is {workspace, category, ...}-prefixed — purpose-built for
 *     "one tenant's trail." Super Admin's default view is platform-wide with
 *     an optional workspace filter, the opposite access pattern.
 *  2. A new collection carries zero migration/shared-write risk to the
 *     existing Access & Permissions / milestone audit trail.
 *
 * Same shape as AuditLog.js otherwise (denormalized actor/target fields so a
 * row reads correctly even if the underlying user is later renamed/deleted).
 * Never log passwords, invitation tokens, auth secrets, or API secrets.
 *
 * Not workspace-scoped (no workspaceScopePlugin) — queried directly, same
 * bucket as AuditLog/WorkspaceMembership.
 */
const changeDetailSchema = new mongoose.Schema({
  label: { type: String, required: true },
  previous: mongoose.Schema.Types.Mixed,
  next: mongoose.Schema.Types.Mixed
}, { _id: false });

const superAdminAuditLogSchema = new mongoose.Schema({
  // Optional — the env-var bootstrap grant has no logged-in actor.
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // Nullable — not every action targets one workspace (e.g. access grants).
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', default: null },
  action: { type: String, required: true },
  targetType: { type: String, required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId },
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed
  },
  reason: { type: String, trim: true, default: '' },
  ipAddress: String,
  userAgent: String,
  category: { type: String, index: true, default: 'super_admin' },
  resourceKey: String,
  resourceLabel: String,
  summary: String,
  changeDetails: [changeDetailSchema],
  actorName: String,
  actorEmail: String,
  targetName: String,
  targetEmail: String,
  workspaceName: String
}, { timestamps: true });

// Platform-first indexes — no workspace prefix, unlike AuditLog's. No
// explicit { _id: -1 } index: MongoDB's automatic _id index already
// supports sorting in either direction and rejects a second custom one.
superAdminAuditLogSchema.index({ action: 1, _id: -1 });
superAdminAuditLogSchema.index({ actor: 1, _id: -1 });
superAdminAuditLogSchema.index({ workspace: 1, _id: -1 });
superAdminAuditLogSchema.index({ category: 1, _id: -1 });
superAdminAuditLogSchema.index({ actorName: 'text', targetName: 'text', resourceLabel: 'text', summary: 'text' });

export default mongoose.model('SuperAdminAuditLog', superAdminAuditLogSchema);
