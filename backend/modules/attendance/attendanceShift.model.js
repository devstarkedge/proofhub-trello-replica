import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * A named shift definition — start/end are plain 'HH:mm' local (workspace
 * timezone) wall-clock times, not instants, since a shift is a recurring
 * daily template, not a one-off event. `startLocalTime > endLocalTime`
 * (as zero-padded strings, so lexicographic comparison is correct) means
 * an overnight shift (e.g. 22:00 -> 06:00) — see
 * attendanceShiftResolver.service.js#isOvernightShift, the one place this
 * is computed, never re-derived elsewhere (spec §23's workDateKey rule
 * depends on getting this right consistently).
 */
const attendanceShiftSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true, trim: true, maxlength: 150 },
  startLocalTime: { type: String, required: true, match: TIME_PATTERN },
  endLocalTime: { type: String, required: true, match: TIME_PATTERN },
  breakMinutes: { type: Number, default: 0, min: 0 },
  // null on any of these three means "fall through to the applicable
  // AttendancePolicyVersion's own value" — a shift only overrides what it
  // explicitly sets.
  graceMinutes: { type: Number, default: null, min: 0 },
  minimumFullDayMinutes: { type: Number, default: null, min: 1 },
  minimumHalfDayMinutes: { type: Number, default: null, min: 1 },
  isDefault: { type: Boolean, default: false },
  effectiveFrom: { type: Date, default: () => new Date(0) },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

attendanceShiftSchema.index({ workspaceId: 1, name: 1 }, { unique: true });
attendanceShiftSchema.index({ workspaceId: 1, isActive: 1 });

attendanceShiftSchema.plugin(workspaceScopePlugin);

export default mongoose.model('AttendanceShift', attendanceShiftSchema);
