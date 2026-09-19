import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * The business-date summary for one (workspace, user, workDateKey) —
 * separate from AttendanceSession (the actual check-in/out interval, see
 * that model) per spec §33. Snapshots the policy version, shift, and
 * calendar classification that were in effect when computed, so a later
 * policy/shift/calendar edit never silently reinterprets a historical day
 * (spec §21, §74). Regularization never mutates this document's raw
 * inputs — see attendanceRegularization.model.js — only the resolver's
 * recomputation of the derived fields below, driven by an approved
 * correction overlay.
 *
 * Multi-dimensional status (spec §31), never one overloaded enum:
 * presenceState + punctualityState + leaveState + presenceFraction/
 * leaveFraction together describe e.g. "first half on approved leave,
 * second half present" without forcing a single misleading value.
 */
const attendanceDaySchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  workDateKey: { type: String, required: true }, // 'YYYY-MM-DD', workspace tz, shift-aware (spec §23)

  // Calendar snapshot (from the shared Work Calendar facade at resolution time).
  calendarDayType: {
    type: String,
    enum: ['WORKING_DAY', 'WEEKLY_OFF', 'RECURRING_WORKING', 'RECURRING_OFF', 'SPECIAL_WORKING_DAY', 'SPECIAL_OFF_DAY', 'HOLIDAY'],
    default: 'WORKING_DAY'
  },
  isCalendarWorkingDay: { type: Boolean, default: true },

  // Policy/shift snapshot references — content-frozen documents, so this
  // reference alone is enough to fully explain the day later.
  policyVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendancePolicyVersion', default: null },
  shift: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceShift', default: null },

  workMode: { type: String, enum: ['OFFICE', 'WFH', 'HYBRID', 'FIELD'], default: 'OFFICE' },

  firstCheckInAt: { type: Date, default: null },
  lastCheckOutAt: { type: Date, default: null },
  workedMinutes: { type: Number, default: 0, min: 0 },
  shiftExpectedMinutes: { type: Number, default: 0, min: 0 }, // from policy/shift minimumFullDayMinutes, NOT the calendar's own expected-hours concept
  lateMinutes: { type: Number, default: 0, min: 0 },
  earlyExitMinutes: { type: Number, default: 0, min: 0 },

  presenceState: {
    type: String,
    enum: ['NOT_STARTED', 'PRESENT', 'HALF_PRESENT', 'ABSENT', 'MISSING_CHECKOUT'],
    default: 'NOT_STARTED'
  },
  punctualityState: { type: String, enum: ['ON_TIME', 'LATE', 'EARLY_EXIT', 'LATE_AND_EARLY_EXIT', null], default: null },
  leaveState: { type: String, enum: ['NONE', 'FULL_LEAVE', 'HALF_LEAVE_FIRST', 'HALF_LEAVE_SECOND', 'SHORT_LEAVE'], default: 'NONE' },
  // Fractions of the day (0 / 0.5 / 1) — how much is presence vs. leave;
  // they need not sum to 1 (e.g. a rejected-checkout day mid-resolution).
  presenceFraction: { type: Number, default: 0, min: 0, max: 1 },
  leaveFraction: { type: Number, default: 0, min: 0, max: 1 },

  exceptionFlags: { type: [String], default: [] }, // e.g. WORKED_ON_OFF_DAY, SYSTEM_GENERATED_CHECKOUT, REGULARIZED, NO_ELIGIBLE_LOCATION
  isFinalized: { type: Boolean, default: false }, // set by the daily finalization job once the day can no longer change on its own
  finalizedAt: { type: Date, default: null }
}, { timestamps: true });

attendanceDaySchema.index({ workspaceId: 1, user: 1, workDateKey: 1 }, { unique: true });
attendanceDaySchema.index({ workspaceId: 1, workDateKey: 1 });
attendanceDaySchema.index({ workspaceId: 1, presenceState: 1, workDateKey: 1 });

attendanceDaySchema.plugin(workspaceScopePlugin);

export default mongoose.model('AttendanceDay', attendanceDaySchema);
