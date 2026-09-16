import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * One row per approval level (DEPARTMENT_MANAGER / HR / ADMIN) for a given
 * LeaveRequest — an OR-gate across `eligibleApproverUserIds` (any one of
 * them deciding resolves the level) and an AND-gate across every level that
 * was actually created for the request (see leaveApproval.service.js). A
 * level with no applicable/available approvers is simply never created —
 * there is no 'SKIPPED' status.
 *
 * `eligibleApproverUserIds` is a frozen snapshot taken when the request was
 * submitted, not a live lookup — a department's manager changing after
 * submission must never silently change who was authorized to decide an
 * already-in-flight request (see leaveRequest.model.js's
 * requesterDepartmentIds for the matching rationale on the requester side).
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
