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
  coordinates: { type: [Number], default: null }, // [longitude, latitude], if captured
  reportedAccuracyMeters: { type: Number, default: null },
  capturedAt: { type: Date, default: null }, // client GPS fix time — freshness check only
  distanceMeters: { type: Number, default: null },
  allowedRadiusMeters: { type: Number, default: null },
  ipAddress: { type: String, default: null } // audit/risk signal only — never treated as location proof (spec §19)
}, { _id: false });

/**
 * The actual Check-In -> Check-Out interval — separate from AttendanceDay
 * (the business-date summary, see that model) per spec §33. Regularization
 * never mutates this document (spec §34, §54): original evidence and
 * timestamps stay exactly as captured forever; an approved correction is a
 * layer the resolver applies on top, tracked on AttendanceRegularization.
 */
const attendanceSessionSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  attendanceDay: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceDay', required: true },
  workDateKey: { type: String, required: true }, // denormalized from AttendanceDay for cheap range queries

  status: { type: String, enum: ['ACTIVE', 'CLOSED'], default: 'ACTIVE' },
  checkInAt: { type: Date, required: true }, // server timestamp, always
  checkOutAt: { type: Date, default: null },

  checkIn: { type: evidenceSchema, required: true },
  checkOut: { type: evidenceSchema, default: null },

  // Snapshots taken at check-in so a later policy/location change can never
  // trap an already-active session or reinterpret it (spec §37, §74, §80-82).
  policyVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendancePolicyVersion', default: null },
  shift: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceShift', default: null },

  systemGeneratedCheckout: { type: Boolean, default: false },
  idempotencyKey: { type: String, trim: true, minlength: 8, maxlength: 128, default: null },

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
attendanceSessionSchema.index({ workspaceId: 1, attendanceDay: 1 });
attendanceSessionSchema.index({ workspaceId: 1, user: 1, idempotencyKey: 1 }, { unique: true, sparse: true });

attendanceSessionSchema.plugin(workspaceScopePlugin);

// Immutable after creation except the small set of fields a check-out (or
// an authorized system auto-close) legitimately needs to write — mirrors
// MilestoneApproval.js's "history is immutable" guard pattern, but scoped
// to permit exactly one legitimate follow-up write (closing the session)
// rather than none at all.
const MUTABLE_AFTER_CREATE_PATHS = new Set(['status', 'checkOutAt', 'checkOut', 'systemGeneratedCheckout', 'updatedAt']);
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
