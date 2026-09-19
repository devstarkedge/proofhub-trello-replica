import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * The shared approval engine for both WFH and Regularization requests
 * (spec §52) — no generic cross-module approval engine exists in FlowTask
 * today (MilestoneApproval is single-decision/finance-specific; LeaveApproval
 * is Leave-specific), so this is a module-local, polymorphic generalization
 * of LeaveApproval's own proven shape: one row per approval level, an
 * OR-gate across a frozen `eligibleApproverUserIds` snapshot, an AND-gate
 * across every level actually created for the entity, and a conditional
 * `findOneAndUpdate({status:'PENDING'})` decision write as the concurrency
 * guard (see attendanceApproval.service.js) — never a blanket immutability
 * hook, since exactly one PENDING -> APPROVED|REJECTED transition is
 * legitimate.
 */
const attendanceApprovalSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  entityType: { type: String, enum: ['WFH_REQUEST', 'REGULARIZATION_REQUEST'], required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  level: { type: String, enum: ['MANAGER', 'HR', 'ADMIN'], required: true },
  eligibleApproverUserIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'VOIDED'], default: 'PENDING' },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt: { type: Date, default: null },
  comment: { type: String, trim: true, maxlength: 1000, default: '' }
}, { timestamps: true });

attendanceApprovalSchema.index({ workspaceId: 1, entityType: 1, entityId: 1, level: 1 }, { unique: true });
attendanceApprovalSchema.index({ workspaceId: 1, status: 1, eligibleApproverUserIds: 1 }); // "my approval queue"

attendanceApprovalSchema.plugin(workspaceScopePlugin);

export default mongoose.model('AttendanceApproval', attendanceApprovalSchema);
