import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * Stable policy identity — a container for LeavePolicyVersion rows. Never
 * holds rule content itself (see leavePolicyVersion.model.js), so renaming a
 * policy or publishing a new version never touches historical requests,
 * which reference the LeavePolicyVersion directly.
 */
const leavePolicySchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true, trim: true, maxlength: 150 },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  // draft: never activated. scheduled: a version is queued for a future
  // effectiveDate (workspace-tz), not yet governing anything. active:
  // currently governs calculations (only meaningful together with
  // isDefault — see the partial unique index below). inactive: was active,
  // superseded by a different default policy taking over. archived:
  // explicitly retired by HR/Admin.
  status: { type: String, enum: ['draft', 'scheduled', 'active', 'inactive', 'archived'], default: 'draft' },
  currentVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'LeavePolicyVersion', default: null },
  // Set once activation first happens (or is scheduled) and mirrors
  // currentVersion.effectiveFrom (or the pending version's, while
  // status='scheduled' and currentVersion is still null).
  effectiveDate: { type: Date, default: null },
  // A version with status='scheduled' waiting to take over from
  // currentVersion once its effectiveFrom arrives — set by an edit with a
  // future effective date; cleared once the scheduler (or a manual
  // activation) promotes it. Independent of `status`, which keeps
  // describing the policy's OWN current state (e.g. still 'active' while a
  // pending edit is scheduled).
  pendingVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'LeavePolicyVersion', default: null },
  // True for the one policy meant to govern the whole workspace by default
  // (what the Policies settings page manages). Department/role/employee-
  // specific override policies created via the advanced assignment API are
  // never marked default, so they never compete for the single-active slot
  // below — that constraint exists to satisfy "exactly one active policy
  // per workspace" for the simple, primary workspace-wide policy, not to
  // forbid narrower overrides from separately being active for their own
  // scope.
  isDefault: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

leavePolicySchema.index({ workspaceId: 1, name: 1 }, { unique: true });
leavePolicySchema.index({ workspaceId: 1, status: 1 });
leavePolicySchema.index({ workspaceId: 1, isDefault: 1 });
// Enforces "exactly one active default policy per workspace" atomically at
// the DB level — the ultimate backstop against a double-activation race,
// independent of and in addition to the transaction in
// leavePolicy.service.js#activateDefaultPolicyTransaction.
leavePolicySchema.index(
  { workspaceId: 1 },
  { unique: true, partialFilterExpression: { status: 'active', isDefault: true } }
);

leavePolicySchema.plugin(workspaceScopePlugin);

export default mongoose.model('LeavePolicy', leavePolicySchema);
