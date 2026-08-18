import mongoose from 'mongoose';
import { WORKSPACE_TYPES, INDUSTRY_OPTIONS, COMPANY_SIZE_OPTIONS } from '../utils/workspaceOptions.js';

/**
 * Workspace — the top-level multi-tenant boundary. Every workspace-owned
 * collection carries a `workspaceId` pointing here (see
 * modules/workspaces/workspaceScopePlugin.js), and a user's role/department/
 * access scope is resolved per (user, workspace) via WorkspaceMembership,
 * never globally off the User document.
 *
 * Relocated from modules/authorization/models/Workspace.js, where it was
 * built as part of a dormant ABAC scaffold but never populated. It was
 * already being reused by modules/permissions/workspaceService.js to seed a
 * single default workspace ahead of this migration — that single row is now
 * the first real tenant, not a placeholder.
 */
const workspaceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isActive: { type: Boolean, default: true },
  // Platform-level lifecycle (Super Admin Dashboard). `status` is the
  // authoritative field going forward; `isActive` is kept in sync by the
  // pre('validate') hook below purely so the ~15 pre-existing call sites
  // that already read `isActive` (protect's membership gate, getMyWorkspaces,
  // the Slack integration) keep working unmodified. Lowercase values to match
  // every other status enum in this codebase (WorkspaceMembership.status,
  // WorkspaceInvitation.status, Board.status).
  status: { type: String, enum: ['active', 'suspended', 'archived'], default: 'active' },
  statusReason: { type: String, trim: true, default: null },
  statusChangedAt: { type: Date, default: null },
  statusChangedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // Not schema-`required` — pre-migration workspaces have none of these
  // until the boot-time backfill runs (see scripts/migrateWorkspaceTypeFields.js),
  // and several existing controller call sites .save() a hydrated Workspace
  // doc without ever touching these fields. "Must have a type" is enforced
  // in workspaceController.createWorkspace for *new* workspaces only.
  type: { type: String, enum: [...WORKSPACE_TYPES, null], default: null },
  industry: { type: String, enum: [...INDUSTRY_OPTIONS, null], default: null },
  companySize: { type: String, enum: [...COMPANY_SIZE_OPTIONS, null], default: null },
  settings: {
    restrictDomain: { type: String }, // e.g. "@acme.com" only
  },
  // Custom branding (icon today; the shape leaves room for future
  // additions — theme colors, favicon, banner, login branding — without
  // another migration, per the workspace branding roadmap).
  icon: {
    url: { type: String, default: null },
    publicId: { type: String, default: null },
    format: { type: String, default: null },
    isSvg: { type: Boolean, default: false },
    smallUrl: { type: String, default: null },
    mediumUrl: { type: String, default: null },
    largeUrl: { type: String, default: null },
    uploadedAt: { type: Date, default: null },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  }
}, { timestamps: true });

workspaceSchema.index({ owner: 1 });
workspaceSchema.index({ isActive: 1 });
workspaceSchema.index({ status: 1 });
// Backs Super Admin's server-side workspace search (name/slug) — see
// modules/superAdmin/workspaceStatsService.js.
workspaceSchema.index({ name: 'text', slug: 'text' });

// Keeps `status` and the legacy `isActive` boolean in sync in both
// directions so every existing `isActive` read site (and the one existing
// write site, workspaceController.deactivateWorkspace) keeps working
// unmodified while `status` becomes the authoritative lifecycle field.
workspaceSchema.pre('validate', function (next) {
  if (this.isModified('status') && !this.isModified('isActive')) {
    this.isActive = this.status === 'active';
  } else if (this.isModified('isActive') && !this.isModified('status')) {
    this.status = this.isActive ? 'active' : 'suspended';
  }
  next();
});

export default mongoose.model('Workspace', workspaceSchema);
