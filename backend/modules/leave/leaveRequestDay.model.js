import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * One row per calendar date covered by a LeaveRequest, classified once at
 * submission time via leaveCalendar.service.js#classifyDate. The spec's
 * single display enum (LEAVE_DAY/WORKING_DAY/HOLIDAY/WEEKLY_OFF/HALF_DAY) is
 * a derived read-time value, not stored redundantly here — see
 * leaveRequestDay.util.js#describeDay: `isConsuming ? (dayType==='FULL_DAY'
 * ? 'LEAVE_DAY' : dayType) : calendarClassification`.
 */
const leaveRequestDaySchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  request: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequest', required: true },
  date: { type: Date, required: true },
  // Snapshot from classifyDate at submission — a holiday added/removed
  // later never rewrites how an already-submitted day was classified.
  calendarClassification: { type: String, enum: ['WORKING_DAY', 'HOLIDAY', 'WEEKLY_OFF'], required: true },
  dayType: {
    type: String,
    enum: ['FULL_DAY', 'HALF_DAY_FIRST_HALF', 'HALF_DAY_SECOND_HALF', 'SHORT_LEAVE'],
    required: true
  },
  isConsuming: { type: Boolean, required: true },
  requestedAmount: { type: Number, required: true, min: 0 },
  consumedAmount: { type: Number, default: 0, min: 0 },
  shortLeaveStartTime: { type: String, default: null }, // 'HH:mm'
  shortLeaveEndTime: { type: String, default: null },
  shortLeaveDurationMinutes: { type: Number, default: null, min: 1 }
}, { timestamps: true });

leaveRequestDaySchema.index({ workspaceId: 1, request: 1, date: 1 }, { unique: true });
leaveRequestDaySchema.index({ workspaceId: 1, date: 1 }); // calendar rendering across users

leaveRequestDaySchema.plugin(workspaceScopePlugin);

export default mongoose.model('LeaveRequestDay', leaveRequestDaySchema);
