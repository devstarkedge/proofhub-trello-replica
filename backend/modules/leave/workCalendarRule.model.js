import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * A generic recurring/nth-weekday override on top of the workspace's base
 * WorkCalendar weekly pattern — e.g. "2nd Saturday = Working",
 * "4th Saturday = Off", for any weekday, not hardcoded to Saturday.
 * Workspace-scoped only (no per-department recurring rules in this pass —
 * the base weekly pattern keeps its existing department-override
 * capability unchanged). Resolved by leaveCalendar.service.js, ranked
 * above the base pattern and below Holiday/date overrides — see that
 * file's classifyDateWithContext for the full precedence chain.
 */
const workCalendarRuleSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  dayOfWeek: { type: Number, required: true, min: 0, max: 6 }, // 0 = Sunday, matches Date#getDay()
  occurrence: { type: String, enum: ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'LAST'], required: true },
  action: { type: String, enum: ['WORKING', 'OFF'], required: true },
  label: { type: String, trim: true, maxlength: 150, default: '' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// At most one ACTIVE rule may target a given (weekday, occurrence) pair —
// the service layer additionally rejects saving both an active FIFTH and
// LAST rule for the same weekday, since those can name the same real date
// in a 5-occurrence month and neither index alone catches that ambiguity.
workCalendarRuleSchema.index(
  { workspaceId: 1, dayOfWeek: 1, occurrence: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);
workCalendarRuleSchema.index({ workspaceId: 1, isActive: 1 });

workCalendarRuleSchema.plugin(workspaceScopePlugin);

export default mongoose.model('WorkCalendarRule', workCalendarRuleSchema);
