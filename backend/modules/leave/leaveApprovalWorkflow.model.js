import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * Workspace routing, reminder and blackout settings. Every request requires
 * an active Admin plus a different Manager/HR approver. Legacy tier/fallback
 * fields remain readable for compatibility but cannot lower that quorum.
 */
const reminderConfigSchema = new mongoose.Schema({
  firstReminderAfterHours: { type: Number, default: 24, min: 1 },
  secondReminderAfterHours: { type: Number, default: 48, min: 1 },
  escalateAfterHours: { type: Number, default: 72, min: 1 },
  escalateTo: { type: String, enum: ['ADMIN', 'NONE'], default: 'ADMIN' }
}, { _id: false });

const leaveApprovalWorkflowSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, trim: true, default: 'Default Workflow' },
  isActive: { type: Boolean, default: true },
  approvalMode: { type: String, enum: ['PARALLEL', 'SEQUENTIAL'], default: 'PARALLEL' },
  roleTierMap: {
    type: Map,
    of: Number,
    default: () => new Map([['employee', 0], ['manager', 1], ['hr', 1], ['admin', 2]])
  },
  // Legacy configuration retained for historical reads. It cannot substitute
  // a non-admin for the mandatory administrator decision.
  adminFallbackApproverUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reminders: { type: reminderConfigSchema, default: () => ({}) },
  blackoutDateBehavior: {
    type: String,
    enum: ['BLOCK', 'WARN_APPROVER', 'REQUIRE_ADMIN_OVERRIDE'],
    default: 'WARN_APPROVER'
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

leaveApprovalWorkflowSchema.index({ workspaceId: 1, isActive: 1 });

leaveApprovalWorkflowSchema.plugin(workspaceScopePlugin);

export default mongoose.model('LeaveApprovalWorkflow', leaveApprovalWorkflowSchema);
