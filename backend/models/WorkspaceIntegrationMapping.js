import mongoose from 'mongoose';

/**
 * WorkspaceIntegrationMapping — permanent 1:1 link between a FlowTask
 * Workspace and its counterpart Workspace in ChatApp (a separate MongoDB
 * deployment — no cross-DB joins possible, so each side keeps its own copy).
 *
 * FlowTask never learns/stores ChatApp's id proactively; this row is written
 * once ChatApp tells us its id in the response to the first "Open Chat" SSO
 * login for a given FlowTask workspace (see chatIntegrationController.js).
 * Every outbound webhook payload instead carries FlowTask's OWN workspaceId
 * (read directly off the workspace-owned entity — see chatWebhookPayloads.js)
 * and lets ChatApp resolve it through ITS copy of this mapping on receipt.
 *
 * Not workspace-owned data — this is a tenant-boundary record, like
 * Workspace/WorkspaceMembership themselves. Do not add workspaceScopePlugin
 * or list it in scripts/_workspaceOwnedModels.js.
 */
const workspaceIntegrationMappingSchema = new mongoose.Schema({
  flowTaskWorkspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  // Opaque id from ChatApp's own database — plain String, never a local ref/populate target.
  chatAppWorkspaceId: { type: String, required: true, match: /^[0-9a-fA-F]{24}$/ },
  chatAppWorkspaceSlug: { type: String, default: null },
  status: { type: String, enum: ['active', 'revoked'], default: 'active' },
  // Unused until Phase 2's reverse (ChatApp→FlowTask) sync exists, but the
  // field is added now so it doesn't require a later migration.
  syncOrigin: { type: String, enum: ['user_initiated', 'sync_provisioned'], required: true, default: 'user_initiated' },
  linkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  linkedAt: { type: Date, default: Date.now },
}, { timestamps: true });

workspaceIntegrationMappingSchema.index({ flowTaskWorkspaceId: 1 }, { unique: true });
workspaceIntegrationMappingSchema.index({ chatAppWorkspaceId: 1 }, { unique: true });

export default mongoose.model('WorkspaceIntegrationMapping', workspaceIntegrationMappingSchema);
