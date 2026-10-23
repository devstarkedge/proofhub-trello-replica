import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * One row per approval level (DEPARTMENT_MANAGER / HR / ADMIN) for a given
 * LeaveRequest — an OR-gate across `eligibleApproverUserIds` (any one of
 * them deciding resolves the level). Final approval requires ADMIN plus
 * either DEPARTMENT_MANAGER or HR from a different person. Remaining pending
 * stages are VOIDED when the request is finalized.
 *
 * `eligibleApproverUserIds` is a frozen snapshot taken when the request was
 * submitted. It preserves assignment history; a decision additionally
 * requires current workspace membership, resource access and organizational
 * authority. Revoked managers cannot decide an in-flight request.
 *
 * Decisions are written via a conditional `findOneAndUpdate` matching
 * `{status: 'PENDING'}` (see leaveApproval.service.js#decideApproval) — a
 * concurrent second decision attempt matches zero documents and surfaces as
 * a 409, never a silent overwrite. That conditional query is the actual
 * concurrency guard; this schema intentionally has no blanket immutability
 * hook (unlike LeaveLedger/MilestoneApproval) because exactly one
 * PENDING -> APPROVED|REJECTED transition is legitimate here.
 */
const leaveApprovalSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  request: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequest', required: true },
  level: { type: String, enum: ['DEPARTMENT_MANAGER', 'HR', 'ADMIN'], required: true },
  sequence: { type: Number, min: 0 },
  mode: { type: String, enum: ['PARALLEL', 'SEQUENTIAL'], default: 'PARALLEL' },
  eligibleApproverUserIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'VOIDED'], default: 'PENDING' },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt: { type: Date, default: null },
  comment: { type: String, trim: true, maxlength: 1000, default: '' }
}, { timestamps: true });

leaveApprovalSchema.index({ workspaceId: 1, request: 1, level: 1 }, { unique: true });
leaveApprovalSchema.index({ workspaceId: 1, status: 1, eligibleApproverUserIds: 1 }); // "my approval queue"

leaveApprovalSchema.plugin(workspaceScopePlugin);

export default mongoose.model('LeaveApproval', leaveApprovalSchema);
