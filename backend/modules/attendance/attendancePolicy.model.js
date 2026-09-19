import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * Stable policy identity — a container for AttendancePolicyVersion rows,
 * mirroring leavePolicy.model.js exactly (see that file for the full
 * reasoning: renaming/editing a policy never touches historical records,
 * which reference the AttendancePolicyVersion directly). Workspace-only in
 * this pass — no per-department policy, matching the same scope-control
 * decision already made for Work Calendar recurring rules this session.
 *
 * `isDefault` + the partial unique index below reproduce the exact
 * "exactly one active policy per workspace" guarantee already proven for
 * LeavePolicy — see leavePolicy.service.js#activateDefaultPolicyTransaction
 * for the transaction shape this module's activation logic mirrors.
 */
const attendancePolicySchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true, trim: true, maxlength: 150 },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  status: { type: String, enum: ['draft', 'scheduled', 'active', 'inactive', 'archived'], default: 'draft' },
  currentVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendancePolicyVersion', default: null },
  effectiveDate: { type: Date, default: null },
  pendingVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendancePolicyVersion', default: null },
  isDefault: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

attendancePolicySchema.index({ workspaceId: 1, name: 1 }, { unique: true });
attendancePolicySchema.index({ workspaceId: 1, status: 1 });
attendancePolicySchema.index(
  { workspaceId: 1 },
  { unique: true, partialFilterExpression: { status: 'active', isDefault: true } }
);

attendancePolicySchema.plugin(workspaceScopePlugin);

export default mongoose.model('AttendancePolicy', attendancePolicySchema);
