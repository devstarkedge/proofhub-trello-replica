import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * Leave-specific per-(workspace, user) facts that don't exist anywhere else
 * in FlowTask today (no `reportsTo`, employment-status, or hire-date field
 * exists on User/WorkspaceMembership — confirmed absent). Kept as its own
 * collection rather than additive fields on WorkspaceMembership (a hot-path,
 * cache-backed model read on every request) so this module's schema can
 * keep evolving without touching a foundational auth model. Lazily
 * created — a user with no row here is simply treated as ACTIVE with no
 * probation, so no backfill/migration is needed for existing members.
 */
const leaveEmployeeProfileSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  employmentStatus: {
    type: String,
    enum: ['ACTIVE', 'ON_PROBATION', 'SUSPENDED', 'RESIGNED', 'TERMINATED'],
    default: 'ACTIVE'
  },
  hireDate: { type: Date, default: null },
  probationEndsAt: { type: Date, default: null },
  // Overrides the policy's normal joining/probation accrual-start
  // computation for this one employee (e.g. a migrated employee whose real
  // accrual start predates FlowTask itself) — set explicitly by HR, never
  // inferred.
  accrualStartOverrideDate: { type: Date, default: null },
  notes: { type: String, trim: true, maxlength: 1000, default: '' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

leaveEmployeeProfileSchema.index({ workspaceId: 1, user: 1 }, { unique: true });
leaveEmployeeProfileSchema.index({ workspaceId: 1, employmentStatus: 1 });

leaveEmployeeProfileSchema.plugin(workspaceScopePlugin);

export default mongoose.model('LeaveEmployeeProfile', leaveEmployeeProfileSchema);
