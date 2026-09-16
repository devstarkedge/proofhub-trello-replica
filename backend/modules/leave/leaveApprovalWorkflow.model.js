import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * One active approval-routing configuration per workspace. `roleTierMap` is
 * what makes routing table-driven instead of hardcoded per-role branches —
 * see leaveApproval.service.js#generateApprovalChain: a level is created
 * only if it sits strictly above the requester's own tier. The default
 * `{employee:0, manager:1, hr:1, admin:2}` reproduces every case the spec
 * describes (Employee needs Manager+HR+Admin; Manager/HR need only Admin;
 * Admin always needs a different eligible Admin/fallback) without any
 * role-string branch in the executed logic, and HR/Admin can retune it later
 * through leavePolicy.controller.js without a code change.
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
  roleTierMap: {
    type: Map,
    of: Number,
    default: () => new Map([['employee', 0], ['manager', 1], ['hr', 1], ['admin', 2]])
  },
  // Fallback approver when zero active Admins exist besides the requester
  // (e.g. a single-Admin workspace where the Admin requests their own
  // leave) — tried before falling back to Workspace.owner. See
  // leaveApproval.service.js for the full fallback chain.
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
