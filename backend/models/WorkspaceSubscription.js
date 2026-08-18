import mongoose from 'mongoose';

/**
 * Links a Workspace to its current Plan (Super Admin Dashboard). Field is
 * named `workspace`, not `workspaceId` — deliberately matching
 * WorkspaceMembership/WorkspaceInvitation's convention for tenant-level
 * records, signaling this is not itself workspace-*owned* data and is
 * therefore exempt from workspaceScopePlugin (queried directly by
 * {workspace: id}, same as those two models).
 *
 * No embedded change-history array by design — the platform audit log
 * (SuperAdminAuditLog, written on every plan change by
 * modules/superAdmin/subscriptionService.js) is the one real history
 * mechanism, consistent with how WorkspaceMembership/Role don't self-track
 * history either.
 */
const workspaceSubscriptionSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, unique: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  status: { type: String, enum: ['active', 'trialing', 'past_due', 'canceled'], default: 'active' },
  billingCycle: { type: String, enum: ['monthly', 'annual'], default: 'monthly' },
  startedAt: { type: Date, default: Date.now },
  renewsAt: { type: Date, default: null },
  canceledAt: { type: Date, default: null },
  notes: { type: String, trim: true, default: '' },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

workspaceSubscriptionSchema.index({ workspace: 1 }, { unique: true });
workspaceSubscriptionSchema.index({ plan: 1 });

export default mongoose.model('WorkspaceSubscription', workspaceSubscriptionSchema);
