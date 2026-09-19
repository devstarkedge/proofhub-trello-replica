import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * A one-off correction for a single date — "26 Sept 2026 is a Special
 * Working Day", "28 Sept 2026 is a Special Off Day" — independent of the
 * named Holiday calendar (Holiday carries recurrence/multi-scope
 * targeting a one-off override doesn't need, and its `type` field is
 * already branched on as "this is a named holiday" by
 * LeaveCalendarGrid.jsx; overloading it here would risk mislabeling a
 * plain correction as a holiday everywhere that display logic runs).
 * Workspace-scoped only. Resolved by leaveCalendar.service.js, ranked
 * ABOVE Holiday in the precedence chain — see that file's
 * classifyDateWithContext for why (lets an override correct a mistaken
 * Holiday entry without disturbing Holiday's existing precedence over the
 * base weekly pattern).
 */
const workCalendarDateOverrideSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  date: { type: Date, required: true }, // via dateOnlyToInstant, same convention as Holiday.date
  type: { type: String, enum: ['WORKING_OVERRIDE', 'OFF_OVERRIDE'], required: true },
  reason: { type: String, required: true, trim: true, maxlength: 150 },
  isHalfDay: { type: Boolean, default: false }, // only meaningful for WORKING_OVERRIDE
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

workCalendarDateOverrideSchema.index({ workspaceId: 1, date: 1 }, { unique: true });

workCalendarDateOverrideSchema.plugin(workspaceScopePlugin);

export default mongoose.model('WorkCalendarDateOverride', workCalendarDateOverrideSchema);
