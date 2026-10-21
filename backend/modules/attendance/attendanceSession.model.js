import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * One evidence bundle captured at check-in or check-out — server
 * timestamp is authoritative; `capturedAt` is the CLIENT's GPS fix
 * timestamp, used only to reject stale coordinates, never stored as (or
 * confused with) the attendance time itself (spec §18, §36).
 */
const evidenceSchema = new mongoose.Schema({
  workMode: { type: String, enum: ['OFFICE', 'WFH', 'HYBRID', 'FIELD'], required: true },
  location: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceLocation', default: null },
  // Denormalized at write time — so this evidence stays fully explainable
  // even after the referenced AttendanceLocation is later renamed or
  // soft-deleted; never re-derived by populating `location` later.
  locationName: { type: String, default: null },
  coordinates: { type: [Number], default: null }, // [longitude, latitude], if captured
  reportedAccuracyMeters: { type: Number, default: null },
  capturedAt: { type: Date, default: null }, // client GPS fix time — freshness check only
  distanceMeters: { type: Number, default: null },
  allowedRadiusMeters: { type: Number, default: null },
  ipAddress: { type: String, default: null } // audit/risk signal only — never treated as location proof (spec §19)
}, { _id: false });

/**
 * The actual Check-In -> Check-Out interval — separate from AttendanceDay
 * (the business-date summary, see that model). Regularization preserves
 * original evidence and records its approved effective interval separately.
 * A successful application marks the issue resolved without inventing GPS,
 * input activity or a second attendance session.
 */
const attendanceSessionSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  attendanceDay: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceDay', required: true },
  workDateKey: { type: String, required: true }, // denormalized from AttendanceDay for cheap range queries

  status: { type: String, enum: ['ACTIVE', 'CLOSED', 'COMPLETED', 'MISSED_CHECKOUT'], default: 'ACTIVE' },
  checkInAt: { type: Date, required: true }, // server timestamp, always
  checkOutAt: { type: Date, default: null },
  trackingReminderAt: {type:Date,default:null},

  checkIn: { type: evidenceSchema, required: true },
  checkOut: { type: evidenceSchema, default: null },

  // Snapshots taken at check-in so a later policy/location change can never
  // trap an already-active session or reinterpret it (spec §37, §74, §80-82).
  policyVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendancePolicyVersion', default: null },
  shift: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceShift', default: null },

  // Policy-aware missed checkout lifecycle fields
  missedCheckoutCutoffAt: { type: Date, default: null },
  effectiveShiftEndAt: { type: Date, default: null },
  closureReason: {
    type: String,
    enum: ['NORMAL_CHECKOUT', 'MISSED_CHECKOUT_CUTOFF', 'AUTO_CLOSED_BY_POLICY', 'SYSTEM_RECONCILIATION', null],
    default: null
  },
  reconciledAt: { type: Date, default: null },
  missedCheckoutDetectedAt: { type: Date, default: null },
  regularizationStatus: {
    type: String,
    enum: ['NONE', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'],
    default: 'NONE'
  },
  // Approved effective interval; original check-in/GPS and missed-checkout
  // evidence stay intact. Only the successful application transaction writes it.
  regularizationResolution: {
    type: new mongoose.Schema({
      request: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceRegularization', required: true },
      checkInAt: { type: Date, required: true }, checkOutAt: { type: Date, required: true },
      appliedAt: { type: Date, required: true }, originalStatus: String
    }, { _id: false }), default: null
  },
  provisionalMinutes: { type: Number, default: 0 },

  systemGeneratedCheckout: { type: Boolean, default: false },
  idempotencyKey: { type: String, trim: true, minlength: 8, maxlength: 128, default: null },

  checkoutOperationId: { type: String, maxlength:128, default:null },
  checkoutSummary: { type: mongoose.Schema.Types.Mixed, default:null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } // usually === user; distinct only for an authorized manual correction path
}, { timestamps: true });

// The DB-level backstop against a double-checkin race (spec §38) — a
// session.withTransaction() check in the service layer is the primary
// guard; this partial unique index is what makes a genuine concurrent
// collision fail loudly instead of silently creating two active sessions.
attendanceSessionSchema.index(
  { workspaceId: 1, user: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' } }
);
attendanceSessionSchema.index({ workspaceId: 1, user: 1, checkInAt: -1 });
attendanceSessionSchema.index({ workspaceId: 1, user: 1, workDateKey: 1 });
attendanceSessionSchema.index({ workspaceId: 1, attendanceDay: 1 });
attendanceSessionSchema.index({ workspaceId: 1, status: 1, missedCheckoutCutoffAt: 1 });
attendanceSessionSchema.index({ status: 1, missedCheckoutCutoffAt: 1, workspaceId: 1 });
attendanceSessionSchema.index({ workspaceId: 1, user: 1, status: 1 });
attendanceSessionSchema.index({workspaceId:1,user:1,status:1,'regularizationResolution.appliedAt':1,checkInAt:-1});
// `partialFilterExpression`, NOT `sparse` — a well-known Mongo gotcha: a
// COMPOUND sparse index only excludes a document when EVERY indexed field
// is missing. workspaceId/user always exist, so a plain `sparse: true`
// here still indexed (and uniquely constrained) every session that had no
// caller-supplied idempotency key, since Mongoose/the service stores that
// as an explicit `idempotencyKey: null` rather than omitting the field. A
// user's SECOND such session ever — any two days, active or already
// closed — collided on this index and was misreported as ALREADY_CHECKED_IN
// with no real active session involved (confirmed root cause of a false
// "already checked in on a brand new day" report). A partial filter that
// only indexes real string keys excludes null/missing entirely, so only
// genuine idempotency-key replays are ever constrained.
attendanceSessionSchema.index(
  { workspaceId: 1, user: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

attendanceSessionSchema.plugin(workspaceScopePlugin);

// Immutable after creation except the fields a check-out, an authorized
// system reconciliation, or a missed-checkout lifecycle event legitimately
// needs to write.
const MUTABLE_AFTER_CREATE_PATHS = new Set([
  'checkoutOperationId', 'checkoutSummary', 'status', 'checkOutAt', 'checkOut', 'systemGeneratedCheckout', 'updatedAt', 'trackingReminderAt',
  'missedCheckoutCutoffAt', 'effectiveShiftEndAt', 'closureReason',
  'reconciledAt', 'missedCheckoutDetectedAt', 'regularizationStatus', 'regularizationResolution', 'provisionalMinutes'
]);
attendanceSessionSchema.pre('save', function guardImmutableEvidence(next) {
  if (this.isNew) return next();
  const changedPaths = this.modifiedPaths();
  const illegalChange = changedPaths.find((path) => !MUTABLE_AFTER_CREATE_PATHS.has(path));
  if (illegalChange) {
    return next(new Error(
      `AttendanceSession evidence is immutable once created (attempted to modify "${illegalChange}"). ` +
      'Use a regularization request to correct it.'
    ));
  }
  next();
});

export default mongoose.model('AttendanceSession', attendanceSessionSchema);
