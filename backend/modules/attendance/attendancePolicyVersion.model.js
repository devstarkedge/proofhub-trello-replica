import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

const gpsRequirementsSchema = new mongoose.Schema({
  maximumGpsAccuracyMeters: { type: Number, default: 100, min: 1 },
  maximumCoordinateAgeSeconds: { type: Number, default: 120, min: 1 },
  locationRequestTimeoutSeconds: { type: Number, default: 30, min: 1 }
}, { _id: false });

const officeRulesSchema = new mongoose.Schema({
  allowAnyActiveWorkspaceLocation: { type: Boolean, default: false },
  requireCheckoutGeofence: { type: Boolean, default: true }
}, { _id: false });

const wfhRulesSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  requireApproval: { type: Boolean, default: true },
  // Which level(s) must approve — spec §51's "configurable — Manager, HR,
  // or Manager+HR": every level listed here gets its own AttendanceApproval
  // row (AND-gate across levels), each resolved to a frozen
  // eligibleApproverUserIds snapshot at submission (see
  // attendanceApproval.service.js#generateApprovalLevels).
  approverLevels: { type: [String], enum: ['MANAGER', 'HR'], default: ['MANAGER'] },
  requireGps: { type: Boolean, default: false },
  allowFutureDates: { type: Boolean, default: true },
  maxDurationDays: { type: Number, default: null, min: 1 },
  allowRecurring: { type: Boolean, default: false },
  availableTo: { type: String, enum: ['ALL_ELIGIBLE', 'SELECTED_USERS'], default: 'ALL_ELIGIBLE' }
}, { _id: false });

const hybridRulesSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  scheduleMode: { type: String, enum: ['FIXED_OFFICE_DAYS', 'FIXED_WFH_DAYS', 'APPROVED_WFH_DATES'], default: 'APPROVED_WFH_DATES' },
  fixedOfficeDaysOfWeek: { type: [Number], default: [] }, // 0-6, Date#getDay() convention
  fixedWfhDaysOfWeek: { type: [Number], default: [] }
}, { _id: false });

const fieldRulesSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  requireGeofence: { type: Boolean, default: false }
}, { _id: false });

const missingCheckoutSchema = new mongoose.Schema({
  behavior: { type: String, enum: ['FLAG_ONLY', 'REQUIRE_REGULARIZATION', 'AUTO_CLOSE_AT_CONFIGURED_TIME'], default: 'FLAG_ONLY' },
  autoCloseAtLocalTime: { type: String, default: null } // 'HH:mm', only meaningful for AUTO_CLOSE_AT_CONFIGURED_TIME
}, { _id: false });

const regularizationRulesSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: true },
  requireApproval: { type: Boolean, default: true },
  approverLevels: { type: [String], enum: ['MANAGER', 'HR'], default: ['MANAGER'] },
  allowedTypes: {
    type: [String],
    default: ['MISSED_CHECK_IN', 'MISSED_CHECK_OUT', 'INCORRECT_TIME', 'GPS_PROBLEM', 'FIELD_WORK', 'FORGOTTEN_ATTENDANCE', 'OTHER']
  }
}, { _id: false });

/**
 * The actual rule content for one Attendance policy, frozen the moment it
 * is first scheduled or published — identical guard pattern to
 * leavePolicyVersion.model.js, for the identical reason: a historical
 * AttendanceDay/session snapshots the version it was computed under, so
 * editing a policy later can never silently reinterpret history (spec §21).
 */
const attendancePolicyVersionSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  policy: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendancePolicy', required: true },
  versionNumber: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['draft', 'scheduled', 'published', 'superseded'], default: 'draft' },
  effectiveFrom: { type: Date, required: true },
  effectiveUntil: { type: Date, default: null },

  defaultShift: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceShift', default: null },
  allowedWorkModes: { type: [String], enum: ['OFFICE', 'WFH', 'HYBRID', 'FIELD'], default: ['OFFICE'] },

  graceMinutes: { type: Number, default: 15, min: 0 },
  earlyExitGraceMinutes: { type: Number, default: 0, min: 0 },
  minimumFullDayMinutes: { type: Number, default: 480, min: 1 },
  minimumHalfDayMinutes: { type: Number, default: 240, min: 1 },
  halfDayTrigger: { type: String, enum: ['MINIMUM_DURATION', 'LATE_ARRIVAL', 'EARLY_DEPARTURE', 'COMBINED'], default: 'MINIMUM_DURATION' },

  gpsRequirements: { type: gpsRequirementsSchema, default: () => ({}) },
  missingCheckout: { type: missingCheckoutSchema, default: () => ({}) },

  offDayAttendanceBehavior: { type: String, enum: ['REJECT', 'ALLOW_WITH_FLAG'], default: 'REJECT' },
  holidayAttendanceBehavior: { type: String, enum: ['REJECT', 'ALLOW_WITH_FLAG'], default: 'REJECT' },
  fullDayLeaveCheckInBehavior: { type: String, enum: ['REJECT', 'ALLOW_WITH_OVERRIDE'], default: 'REJECT' },

  office: { type: officeRulesSchema, default: () => ({}) },
  wfh: { type: wfhRulesSchema, default: () => ({}) },
  hybrid: { type: hybridRulesSchema, default: () => ({}) },
  field: { type: fieldRulesSchema, default: () => ({}) },
  regularization: { type: regularizationRulesSchema, default: () => ({}) },

  // Eligibility-resolver extension points (spec §5) — read by
  // attendanceEligibility.service.js as the optional `attendancePolicy` arg.
  excludedRoles: { type: [String], default: [] },
  excludedUserIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  publishedAt: { type: Date, default: null },
  supersededAt: { type: Date, default: null }
}, { timestamps: true });

attendancePolicyVersionSchema.index({ workspaceId: 1, policy: 1, versionNumber: 1 }, { unique: true });
attendancePolicyVersionSchema.index({ workspaceId: 1, policy: 1, status: 1, effectiveFrom: 1 });

attendancePolicyVersionSchema.plugin(workspaceScopePlugin);

const MUTABLE_AFTER_PUBLISH_PATHS = new Set(['status', 'supersededAt', 'publishedAt', 'updatedAt']);
const FROZEN_ONCE_REACHED = new Set(['scheduled', 'published', 'superseded']);

attendancePolicyVersionSchema.pre('save', function guardPublishedContent(next) {
  if (this.isNew || !FROZEN_ONCE_REACHED.has(this._original?.status)) return next();
  const changedPaths = this.modifiedPaths();
  const illegalChange = changedPaths.find((path) => !MUTABLE_AFTER_PUBLISH_PATHS.has(path));
  if (illegalChange) {
    return next(new Error(
      `AttendancePolicyVersion content is immutable once scheduled or published (attempted to modify "${illegalChange}"). ` +
      'Create a new version instead.'
    ));
  }
  next();
});

attendancePolicyVersionSchema.post('init', function captureOriginalStatus() {
  this._original = { status: this.status };
});

export default mongoose.model('AttendancePolicyVersion', attendancePolicyVersionSchema);
