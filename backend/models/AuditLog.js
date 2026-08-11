import mongoose from 'mongoose';

/**
 * Generic, reusable audit-trail collection — not owned by any one module.
 * The Access & Permissions engine (backend/modules/permissions/) and the
 * milestone service (backend/services/milestone/milestoneService.js) both
 * write to it independently; the shape is deliberately module-agnostic
 * (`category` + `targetType` discriminate the writer).
 *
 * Relocated from modules/authorization/models/AuditLog.js as part of the
 * workspace migration (that module's Role/PermissionGroup/Policy scaffold
 * was deleted as dead code; this model and Workspace were the two live
 * pieces worth keeping).
 *
 * Fields below `userAgent` were added for the centralized Access &
 * Permissions activity log: human-readable, list-cheap, expand-lazy.
 */
const changeDetailSchema = new mongoose.Schema({
  label: { type: String, required: true },
  previous: mongoose.Schema.Types.Mixed,
  next: mongoose.Schema.Types.Mixed
}, { _id: false });

const auditLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  action: { type: String, required: true }, // e.g., 'ROLE_UPDATED', 'PERMISSION_ADDED'
  targetType: { type: String, required: true }, // e.g., 'Role', 'WorkspaceMember'
  targetId: { type: mongoose.Schema.Types.ObjectId },
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed
  },
  ipAddress: String,
  userAgent: String,

  // ── Centralized activity-log fields (optional — absent on older/other-module entries) ──
  // Scopes a query to one writer/module without needing a second collection.
  category: { type: String, index: true },
  // Machine-filterable module/resource key, e.g. 'sales', 'finance', 'role_definition'.
  resourceKey: String,
  // Human label for the same, e.g. 'Sales', 'Finance', 'Role: Manager'.
  resourceLabel: String,
  // One human-readable sentence, computed once at write time — never
  // reconstructed from raw `changes` at render time.
  summary: String,
  // Compact, curated diff for the expand/collapse UI — small by
  // construction (one row per field that actually changed), so unlike
  // `changes.before/after` it's safe to include, but per the "load full
  // details only when expanded" requirement it's still excluded from the
  // list projection and fetched via the detail endpoint on first expand.
  changeDetails: [changeDetailSchema],
  // Denormalized at write time — an audit log must read correctly even if
  // the actor/target's name changes later, and this avoids an N+1 User
  // lookup per row when listing.
  actorName: String,
  actorEmail: String,
  actorRole: String,
  targetName: String,
  targetEmail: String,
  targetRole: String
}, { timestamps: true });

// ── Pagination & filtering indexes ──
// workspace leads every compound index (this file's own category-first
// convention, pre-dating the migration, is the exact precedent every other
// workspace-owned model's indexes now follow — see workspaceScopePlugin.js).
// _id-based keyset pagination (ObjectIds are monotonically increasing at
// creation time, so sorting/filtering on _id alone is a correct, cheap
// substitute for a createdAt+_id compound cursor).
auditLogSchema.index({ workspace: 1, category: 1, _id: -1 });
auditLogSchema.index({ workspace: 1, category: 1, targetId: 1, _id: -1 });
auditLogSchema.index({ workspace: 1, category: 1, actor: 1, _id: -1 });
auditLogSchema.index({ workspace: 1, category: 1, action: 1, _id: -1 });
auditLogSchema.index({ workspace: 1, category: 1, resourceKey: 1, _id: -1 });
auditLogSchema.index({ workspace: 1, category: 1, createdAt: 1 });
// Free-text search across denormalized names/labels/summary.
auditLogSchema.index({ actorName: 'text', targetName: 'text', resourceLabel: 'text', summary: 'text' });

export default mongoose.model('AuditLog', auditLogSchema);
