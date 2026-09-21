import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * A recurring day-of-week rule attached to one AttendanceWorkModeOverride
 * — "every Thursday = WFH" or "1st and 3rd Friday = WFH" (spec §5-6).
 * Structurally mirrors workCalendarRule.model.js (dayOfWeek + occurrence),
 * with one deliberate addition: an 'EVERY' occurrence value. The Work
 * Calendar's own rule model has no such value (an "every Friday" working-
 * day rule there is expressed as five FIRST..FIFTH rows) — but this spec
 * explicitly calls out "Every Thursday = WFH" as the primary, simplest
 * case, and forcing an Admin to create five rows for that would directly
 * contradict the standing "make it easy to use" requirement. Resolution
 * precedence (see attendanceWorkModeOverride.service.js#resolveScheduledMode):
 * an exact-occurrence rule (e.g. THIRD) beats an EVERY rule for the same
 * weekday, which beats the override's own static defaultMode.
 */
const attendanceWorkModeScheduleRuleSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  override: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceWorkModeOverride', required: true },
  dayOfWeek: { type: Number, required: true, min: 0, max: 6 }, // Date#getDay() convention: 0=Sun..6=Sat
  occurrence: { type: String, enum: ['EVERY', 'FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'LAST'], default: 'EVERY' },
  mode: { type: String, enum: ['OFFICE', 'WFH', 'HYBRID', 'FIELD'], required: true },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

attendanceWorkModeScheduleRuleSchema.index({ workspaceId: 1, override: 1, isActive: 1 });
attendanceWorkModeScheduleRuleSchema.index(
  { workspaceId: 1, override: 1, dayOfWeek: 1, occurrence: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

attendanceWorkModeScheduleRuleSchema.plugin(workspaceScopePlugin);

export default mongoose.model('AttendanceWorkModeScheduleRule', attendanceWorkModeScheduleRuleSchema);
