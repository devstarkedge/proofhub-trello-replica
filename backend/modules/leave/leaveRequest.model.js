import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

export const LEAVE_REQUEST_STATUSES = Object.freeze({
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  PARTIALLY_APPROVED: 'PARTIALLY_APPROVED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED_BY_REQUESTER: 'CANCELLED_BY_REQUESTER',
  CANCELLATION_REQUESTED: 'CANCELLATION_REQUESTED',
  CANCELLED_BY_HR: 'CANCELLED_BY_HR',
  CANCELLED_BY_ADMIN: 'CANCELLED_BY_ADMIN',
  EXPIRED: 'EXPIRED'
});

const cancellationSchema = new mongoose.Schema({
  requestedAt: { type: Date, default: null },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  requestedReason: { type: String, trim: true, maxlength: 500, default: '' },
  decidedAt: { type: Date, default: null },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decision: { type: String, enum: ['approved', 'rejected', null], default: null },
  finalizedAt: { type: Date, default: null },
  finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  finalReason: { type: String, trim: true, maxlength: 500, default: '' }
}, { _id: false });

/**
 * The main leave request. `requesterDepartmentIds` is a snapshot taken at
 * submission time (not a live lookup) so a later department transfer never
 * silently rewrites which approval chain applied — see leaveApproval.model.js
 * for the corresponding frozen approver snapshot.
 */
const leaveRequestSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requesterDepartmentIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'Department', default: [] },
  leaveType: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', required: true },
  policyVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'LeavePolicyVersion', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  totalRequestedDayUnits: { type: Number, required: true, min: 0 },
  totalConsumingDayUnits: { type: Number, required: true, min: 0 },
  reason: { type: String, trim: true, maxlength: 1000, default: '' },
  status: {
    type: String,
    enum: Object.values(LEAVE_REQUEST_STATUSES),
    default: LEAVE_REQUEST_STATUSES.PENDING_APPROVAL
  },
  // Set when the approval chain resolves to zero eligible approvers at some
  // level (see leaveApproval.service.js) — the request stays visibly
  // PENDING_APPROVAL rather than auto-approving or vanishing. Surfaced
  // loudly in the UI, never silently resolved.
  blockedReason: { type: String, enum: ['NONE', 'NO_ELIGIBLE_APPROVER'], default: 'NONE' },
  blackoutOverride: {
    warned: { type: Boolean, default: false },
    adminOverrodeBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    overriddenAt: { type: Date, default: null }
  },
  cancellation: { type: cancellationSchema, default: () => ({}) },
  // Optional client-supplied idempotency token guarding against an
  // accidental double-submit (e.g. a double form-click).
  clientRequestId: { type: String, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

leaveRequestSchema.index({ workspaceId: 1, requester: 1, status: 1 });
leaveRequestSchema.index({ workspaceId: 1, status: 1, startDate: 1 });
leaveRequestSchema.index({ workspaceId: 1, requesterDepartmentIds: 1, status: 1 });
leaveRequestSchema.index({ workspaceId: 1, requester: 1, clientRequestId: 1 }, { unique: true, sparse: true });

leaveRequestSchema.plugin(workspaceScopePlugin);

export default mongoose.model('LeaveRequest', leaveRequestSchema);
