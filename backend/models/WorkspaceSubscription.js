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
  // Only meaningful when `plan` resolves to a slug with no shared/global
  // limit (Enterprise) — this one workspace's admin-configured member cap,
  // set at Change Plan time. Free/Pro ignore this field entirely (they
  // always use their fixed global Plan.memberLimit instead), so it stays
  // null for them. null also means "Enterprise, not yet configured" — never
  // silently read as unlimited. See entitlementService.js#resolveMemberLimit,
  // the one place this is read.
  customMemberLimit: { type: Number, default: null, min: 1 },
  notes: { type: String, trim: true, default: '' },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

workspaceSubscriptionSchema.index({ workspace: 1 }, { unique: true });
workspaceSubscriptionSchema.index({ plan: 1 });

export default mongoose.model('WorkspaceSubscription', workspaceSubscriptionSchema);
