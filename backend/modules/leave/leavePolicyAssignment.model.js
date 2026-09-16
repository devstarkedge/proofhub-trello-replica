import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * Maps a LeavePolicy to the employees eligible for it. Resolution for
 * (user, date) — see leavePolicy.service.js#resolveApplicablePolicy —
 * collects every active assignment whose [effectiveFrom, effectiveUntil]
 * window contains the date and whose scope matches, then picks the most
 * specific match (employee > role > department > workspace), tie-broken by
 * `priority` then most recent `effectiveFrom`.
 */
const leavePolicyAssignmentSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  policy: { type: mongoose.Schema.Types.ObjectId, ref: 'LeavePolicy', required: true },
  scope: { type: String, enum: ['workspace', 'department', 'role', 'employee'], required: true },
  // Department/Role(slug-as-string, stored as ObjectId ref Role)/User id per
  // scope; null when scope === 'workspace'.
  scopeRef: { type: mongoose.Schema.Types.ObjectId, default: null },
  priority: { type: Number, default: 0 },
  effectiveFrom: { type: Date, required: true },
  effectiveUntil: { type: Date, default: null },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

leavePolicyAssignmentSchema.index({ workspaceId: 1, policy: 1 });
leavePolicyAssignmentSchema.index({ workspaceId: 1, scope: 1, scopeRef: 1, isActive: 1 });

leavePolicyAssignmentSchema.plugin(workspaceScopePlugin);

export default mongoose.model('LeavePolicyAssignment', leavePolicyAssignmentSchema);
