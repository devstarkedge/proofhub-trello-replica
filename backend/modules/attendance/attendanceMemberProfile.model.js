import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * Attendance-specific per-(workspace, user) configuration — mirrors
 * leaveEmployeeProfile.model.js's shape exactly. Role/department/
 * membership status stay on WorkspaceMembership and are never duplicated
 * here. Lazily created: a user with no row simply gets the safe defaults
 * below (no override, no assigned shift) — no backfill needed for
 * existing members when Attendance is enabled.
 *
 * Work mode (which modes an employee may use, and which applies by
 * default) is NOT configured here — see attendanceWorkModeOverride.model.js
 * for the USER/DEPARTMENT/ROLE/workspace-default override hierarchy that
 * superseded this profile's old `defaultWorkMode`/`fieldEmployee` fields
 * (removed: never exposed via any UI, and duplicated what the override
 * table now does more generally).
 */
const attendanceMemberProfileSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Explicit per-user override of eligibility, independent of role. null
  // means "no override — fall through to the role-based default" (Admin
  // excluded, everyone else included) — see attendanceEligibility.service.js.
  attendanceRequiredOverride: { type: String, enum: ['REQUIRED', 'NOT_REQUIRED', null], default: null },
  assignedShift: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceShift', default: null },
  // Per-user widening of the policy's ANY_ACTIVE_WORKSPACE_LOCATION
  // setting — only meaningful when the policy itself doesn't already
  // grant it workspace-wide; never grants access the policy forbids.
  allowAnyWorkspaceLocation: { type: Boolean, default: false },
  effectiveFrom: { type: Date, default: null },
  effectiveUntil: { type: Date, default: null },
  isActive: { type: Boolean, default: true },
  notes: { type: String, trim: true, maxlength: 1000, default: '' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

attendanceMemberProfileSchema.index({ workspaceId: 1, user: 1 }, { unique: true });

attendanceMemberProfileSchema.plugin(workspaceScopePlugin);

export default mongoose.model('AttendanceMemberProfile', attendanceMemberProfileSchema);
