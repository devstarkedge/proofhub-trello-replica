import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Office Hours Overrides — narrows the workspace's default Office Hours
 * (AttendancePolicyVersion.officeHours/graceMinutes/etc) for a specific
 * Role, Department, or User (new spec §15-23). Structurally mirrors
 * attendanceWorkModeOverride.model.js (scopeType/scopeId/priority/
 * effectiveFrom/effectiveUntil/isActive), but PARTIAL-field override
 * semantics instead of REPLACE-the-whole-set: each of the six fields
 * below is independently nullable, and null means "fall through to the
 * next tier" — mirroring AttendanceShift's own already-proven nullable-
 * fallthrough convention for graceMinutes/minimumFullDayMinutes/
 * minimumHalfDayMinutes (spec §19's "choose one consistent model").
 *
 * Resolution (see attendanceOfficeHoursOverride.service.js#resolveEffectiveOfficeHours):
 * the single most specific matching override wins (USER > DEPARTMENT >
 * ROLE, same algorithm as Work Mode Override) — NOT a per-field merge
 * across multiple tiers. That winner's own null fields fall through to
 * the resolved AttendanceShift (if one applies), then to the workspace
 * AttendancePolicyVersion. No matching override at all falls straight
 * through to Shift then Policy — i.e. today's existing (pre-this-feature)
 * behavior for any workspace that hasn't created an override yet,
 * unchanged.
 *
 * Never hard-deleted (`isActive` only) so history/audit stays intact
 * (spec §11/§24).
 */
const attendanceOfficeHoursOverrideSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  scopeType: { type: String, enum: ['ROLE', 'DEPARTMENT', 'USER'], required: true },
  // Role._id / Department._id / User._id — see attendanceWorkModeOverride.model.js's identical convention.
  scopeId: { type: mongoose.Schema.Types.ObjectId, required: true },

  startLocalTime: { type: String, default: null, match: TIME_PATTERN },
  endLocalTime: { type: String, default: null, match: TIME_PATTERN },
  graceMinutes: { type: Number, default: null, min: 0 },
  earlyExitGraceMinutes: { type: Number, default: null, min: 0 },
  minimumFullDayMinutes: { type: Number, default: null, min: 1 },
  minimumHalfDayMinutes: { type: Number, default: null, min: 1 },

  // Tie-breaker only for a user belonging to multiple departments that
  // each have their own active override — identical role to Work Mode
  // Override's own `priority` field.
  priority: { type: Number, default: 0 },
  effectiveFrom: { type: Date, required: true },
  effectiveUntil: { type: Date, default: null },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

attendanceOfficeHoursOverrideSchema.index({ workspaceId: 1, scopeType: 1, scopeId: 1, isActive: 1 });
attendanceOfficeHoursOverrideSchema.index({ workspaceId: 1, isActive: 1, effectiveFrom: 1 });

attendanceOfficeHoursOverrideSchema.plugin(workspaceScopePlugin);

export default mongoose.model('AttendanceOfficeHoursOverride', attendanceOfficeHoursOverrideSchema);
