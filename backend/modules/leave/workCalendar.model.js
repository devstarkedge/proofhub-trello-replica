import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

const weeklyPatternDaySchema = new mongoose.Schema({
  dayOfWeek: { type: Number, required: true, min: 0, max: 6 }, // 0 = Sunday, matches Date#getDay()
  isWorkingDay: { type: Boolean, default: true },
  isHalfWorkingDay: { type: Boolean, default: false }
}, { _id: false });

/**
 * Workspace- or department-level weekly working pattern — no hardcoded
 * Mon-Fri assumption anywhere. leaveCalendar.service.js#classifyDate reads
 * a department-scoped WorkCalendar first, falling back to the workspace's
 * own if the department has none configured.
 */
const workCalendarSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  scope: { type: String, enum: ['workspace', 'department'], default: 'workspace' },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null }, // required if scope='department'
  weeklyPattern: {
    type: [weeklyPatternDaySchema],
    default: () => [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      isWorkingDay: dayOfWeek >= 1 && dayOfWeek <= 5,
      isHalfWorkingDay: false
    }))
  },
  effectiveFrom: { type: Date, required: true, default: () => new Date(0) },
  isActive: { type: Boolean, default: true },
  // How many minutes count as one full working day for expected-hours math
  // (Teams/productivity, reports) — configurable per workspace instead of a
  // hardcoded 8h/480min constant. Always read through
  // leaveTimezone.util.js#getStandardWorkMinutes, never this field directly:
  // a .lean() read of a pre-existing row predating this field resolves to
  // undefined, not this schema default.
  standardWorkMinutesPerDay: { type: Number, default: 480, min: 1, max: 1440 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

workCalendarSchema.index({ workspaceId: 1, scope: 1, departmentId: 1, isActive: 1 });

workCalendarSchema.plugin(workspaceScopePlugin);

export default mongoose.model('WorkCalendar', workCalendarSchema);
