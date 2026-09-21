import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * An exact-date work-mode override attached to one
 * AttendanceWorkModeOverride — "2026-10-15 = WFH" (spec §6). A date
 * *range* (e.g. "2026-10-01 to 2026-12-31") is a UI/API-layer convenience
 * that expands into one row per date at submission time, mirroring
 * workCalendarDateOverride.model.js's own one-row-per-date shape rather
 * than inventing range-overlap-resolution logic that exists nowhere else
 * in this codebase. Always the most specific match — beats any recurring
 * AttendanceWorkModeScheduleRule for the same date.
 */
const attendanceWorkModeDateOverrideSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  override: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceWorkModeOverride', required: true },
  date: { type: Date, required: true }, // workspace-tz midnight instant, matching dateOnlyToInstant's convention
  mode: { type: String, enum: ['OFFICE', 'WFH', 'HYBRID', 'FIELD'], required: true },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

attendanceWorkModeDateOverrideSchema.index(
  { workspaceId: 1, override: 1, date: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

attendanceWorkModeDateOverrideSchema.plugin(workspaceScopePlugin);

export default mongoose.model('AttendanceWorkModeDateOverride', attendanceWorkModeDateOverrideSchema);
