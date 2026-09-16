import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

const expiryRuleSchema = new mongoose.Schema({
  mode: {
    type: String,
    enum: ['NEVER', 'FIXED_MONTHS_AFTER_CREDIT', 'CALENDAR_YEAR_END', 'FISCAL_YEAR_END'],
    default: 'NEVER'
  },
  months: { type: Number, default: null, min: 1 } // used only when mode = FIXED_MONTHS_AFTER_CREDIT
}, { _id: false });

const carryForwardSchema = new mongoose.Schema({
  allowed: { type: Boolean, default: true },
  maxAmount: { type: Number, default: null, min: 0 },
  maxPercentOfAnnualCredit: { type: Number, default: null, min: 0, max: 100 }
}, { _id: false });

const joiningProbationSchema = new mongoose.Schema({
  accrualStart: { type: String, enum: ['IMMEDIATE', 'AFTER_N_DAYS', 'NEXT_MONTH'], default: 'IMMEDIATE' },
  afterNDays: { type: Number, default: null, min: 0 },
  joiningMonthCredit: { type: String, enum: ['FULL', 'PRORATED', 'ZERO'], default: 'PRORATED' }
}, { _id: false });

const leaveTypeRuleSchema = new mongoose.Schema({
  leaveType: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', required: true },
  monthlyCreditAmount: { type: Number, required: true, min: 0 },
  creditTiming: { type: String, enum: ['START_OF_MONTH', 'END_OF_MONTH'], default: 'START_OF_MONTH' },
  expiryRule: { type: expiryRuleSchema, default: () => ({}) },
  carryForward: { type: carryForwardSchema, default: () => ({}) },
  maxBalanceCap: { type: Number, default: null, min: 0 },
  halfDayEnabled: { type: Boolean, default: true },
  // Only meaningful when `leaveType.category === 'SHORT_LEAVE'` — the one
  // short-leave-specific rule that can't be expressed through the generic
  // credit/expiry fields above (a per-instance duration cap, not a balance
  // amount). Monthly count is already implied by monthlyCreditAmount +
  // carryForward, so no separate "max count" field is needed.
  maxDurationMinutesPerInstance: { type: Number, default: null, min: 1 },
  joiningProbation: { type: joiningProbationSchema, default: () => ({}) },
  weekendHolidayHandling: {
    type: String,
    enum: ['EXCLUDE_FROM_CONSUMPTION', 'INCLUDE_IN_CONSUMPTION'],
    default: 'EXCLUDE_FROM_CONSUMPTION'
  },
  eligibleEmploymentStatuses: {
    type: [String],
    default: ['ACTIVE', 'ON_PROBATION']
  }
}, { _id: false });

const blackoutDateSchema = new mongoose.Schema({
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  reason: { type: String, trim: true, maxlength: 300, default: '' },
  departmentIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'Department', default: [] }
}, { _id: false });

/**
 * The actual rule content for one policy, frozen once published. Requests
 * and accrual buckets reference a LeavePolicyVersion directly (never
 * "the policy's current rules") so editing a policy later can never change
 * how a historical request/bucket is interpreted — see spec's policy-
 * versioning requirement. A new revision is always a new version row; this
 * document's content (everything except `status`/`supersededAt`) is
 * immutable from the moment `status` first becomes 'published'.
 */
const leavePolicyVersionSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  policy: { type: mongoose.Schema.Types.ObjectId, ref: 'LeavePolicy', required: true },
  versionNumber: { type: Number, required: true, min: 1 },
  // scheduled: content frozen (see the guard below), queued to become
  // 'published' once effectiveFrom arrives — see
  // leavePolicy.service.js#runScheduledDefaultPolicyActivations.
  status: { type: String, enum: ['draft', 'scheduled', 'published', 'superseded'], default: 'draft' },
  effectiveFrom: { type: Date, required: true },
  effectiveUntil: { type: Date, default: null },
  leaveTypeRules: { type: [leaveTypeRuleSchema], default: [] },
  approvalWorkflow: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveApprovalWorkflow', default: null },
  blackout: {
    dates: { type: [blackoutDateSchema], default: [] }
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  publishedAt: { type: Date, default: null },
  supersededAt: { type: Date, default: null }
}, { timestamps: true });

leavePolicyVersionSchema.index({ workspaceId: 1, policy: 1, versionNumber: 1 }, { unique: true });
leavePolicyVersionSchema.index({ workspaceId: 1, policy: 1, status: 1, effectiveFrom: 1 });

leavePolicyVersionSchema.plugin(workspaceScopePlugin);

const MUTABLE_AFTER_PUBLISH_PATHS = new Set(['status', 'supersededAt', 'publishedAt', 'updatedAt']);
const FROZEN_ONCE_REACHED = new Set(['scheduled', 'published', 'superseded']);

// Content is frozen the moment a version is first scheduled or published —
// the only legitimate writes after that are the status transition itself
// (scheduled -> published -> superseded) and its timestamps. Freezing at
// 'scheduled' too (not just 'published') means a future-dated edit can never
// be silently altered after the confirmation-diff step that created it —
// the diff a user confirmed is exactly what activates later. This is a
// narrower guard than MilestoneApproval's "immutable after create" (a
// policy version must stay editable while in 'draft').
leavePolicyVersionSchema.pre('save', function guardPublishedContent(next) {
  if (this.isNew || !FROZEN_ONCE_REACHED.has(this._original?.status)) return next();
  const changedPaths = this.modifiedPaths();
  const illegalChange = changedPaths.find((path) => !MUTABLE_AFTER_PUBLISH_PATHS.has(path));
  if (illegalChange) {
    return next(new Error(
      `LeavePolicyVersion content is immutable once scheduled or published (attempted to modify "${illegalChange}"). ` +
      'Create a new version instead.'
    ));
  }
  next();
});

leavePolicyVersionSchema.post('init', function captureOriginalStatus() {
  this._original = { status: this.status };
});

export default mongoose.model('LeavePolicyVersion', leavePolicyVersionSchema);
