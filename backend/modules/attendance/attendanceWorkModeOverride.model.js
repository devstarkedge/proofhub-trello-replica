import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * Work Mode Overrides — narrows which of the workspace's Attendance-Policy-
 * allowed work modes apply to a specific Role, Department, or User.
 * Structurally mirrors attendanceShiftAssignment.model.js (scope/scopeRef/
 * priority/effectiveFrom/effectiveUntil/isActive) rather than inventing a
 * new shape — resolution style is identical (see
 * attendanceWorkModeOverride.service.js#resolveEffectiveWorkModePolicy,
 * which mirrors attendanceShiftResolver.service.js#resolveShiftAssignmentForUser).
 *
 * The workspace-wide default is NOT a row in this collection — it already
 * exists as AttendancePolicyVersion.allowedWorkModes (with its own
 * versioning/scheduling/UI); duplicating it here as a synthetic
 * scopeType:'WORKSPACE' row would be exactly the "separate work-mode logic"
 * the spec warns against. 'WORKSPACE' stays in the enum only so a future
 * lighter-weight "override just the modes without a full policy edit" need
 * has somewhere to go — nothing creates one today.
 *
 * REPLACE semantics only (no ADD/REMOVE) — the most specific applicable
 * override's `allowedModes` becomes the complete effective set, never
 * unioned with a less-specific level. Never hard-deleted (`isActive` only)
 * so history/audit stays intact.
 */
const attendanceWorkModeOverrideSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  scopeType: { type: String, enum: ['WORKSPACE', 'ROLE', 'DEPARTMENT', 'USER'], required: true },
  // Role._id for ROLE (covers both system-role templates and custom roles —
  // see models/Role.js), Department._id for DEPARTMENT, User._id for USER,
  // null for WORKSPACE.
  scopeId: { type: mongoose.Schema.Types.ObjectId, default: null },
  allowedModes: {
    type: [String], enum: ['OFFICE', 'WFH', 'HYBRID', 'FIELD'],
    validate: { validator: (v) => Array.isArray(v) && v.length > 0, message: 'At least one allowed work mode is required' }
  },
  defaultMode: {
    type: String, enum: ['OFFICE', 'WFH', 'HYBRID', 'FIELD'], required: true,
    validate: { validator: function (v) { return this.allowedModes.includes(v); }, message: 'defaultMode must be one of allowedModes' }
  },
  // Tie-breaker ONLY for the case where a user belongs to multiple
  // departments that each have their own active override for the same
  // date — see resolveEffectiveWorkModePolicy's deterministic resolution.
  priority: { type: Number, default: 0 },
  effectiveFrom: { type: Date, required: true },
  effectiveUntil: { type: Date, default: null },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

attendanceWorkModeOverrideSchema.index({ workspaceId: 1, scopeType: 1, scopeId: 1, isActive: 1 });
attendanceWorkModeOverrideSchema.index({ workspaceId: 1, isActive: 1, effectiveFrom: 1 });

attendanceWorkModeOverrideSchema.plugin(workspaceScopePlugin);

export default mongoose.model('AttendanceWorkModeOverride', attendanceWorkModeOverrideSchema);
