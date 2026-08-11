import mongoose from 'mongoose';

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

export default mongoose.model('Workspace', workspaceSchema);
