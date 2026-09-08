import mongoose from 'mongoose';
import { PROJECT_SORT_OPTIONS } from '../../shared/projectView.mjs';

/**
 * The per-(user, workspace) role record. This is what `protect`
 * (backend/middleware/authMiddleware.js) reads to overlay `role`/`roleId`/
 * `department`/`team`/`accessType`/`allowedProjects` onto `req.user` for the
 * currently active workspace — those five fields keep their exact shape so
 * every existing controller that reads `req.user.role` etc. keeps working
 * unmodified, but the *value* now genuinely varies per workspace instead of
 * coming straight off the User document.
 *
 * Mirrors the corresponding fields on User (see backend/models/User.js) —
 * those stay in place as the "default-workspace" copy (a source to seed
 * from, and a fallback for any code path not yet updated to read the
 * overlay), but this collection is the source of truth going forward.
 *
 * Not subject to workspaceScopePlugin — it's always queried explicitly by
 * {user, workspace}, the same way User/Role/Workspace themselves are.
 */
const workspaceMembershipSchema = new mongoose.Schema({
  workspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    default: 'employee',
    lowercase: true,
    trim: true
  },
  roleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role'
  },
  department: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  }],
  team: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team'
  },
  accessType: {
    type: String,
    enum: ['full_department', 'selected_projects', 'assigned_tasks'],
    default: 'full_department'
  },
  allowedProjects: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board'
  }],
  // 'removed' is a soft-delete: the row is kept (not deleted) so a later
  // re-invite/re-add can *restore* it instead of hitting the unique
  // {workspace,user} index as a duplicate-key error, and so history
  // (joinedAt, invitedBy, prior role) isn't lost. Every query elsewhere in
  // the codebase that lists/authorizes "current members" filters explicitly
  // by status — see workspaceController.js for the full audit.
  status: {
    type: String,
    enum: ['active', 'suspended', 'removed'],
    default: 'active'
  },
  // Display preferences only; the existing unique workspace/user index owns scope.
  preferences: {
    departmentOrder: { type: [mongoose.Schema.Types.ObjectId], ref: 'Department', default: [] },
    projectSort: { type: String, enum: PROJECT_SORT_OPTIONS.map(option => option.value), default: 'default' }
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  // Workspace-scoped (not on User) — the same person can hold a different
  // employee ID at a different employer/workspace. Set via the centralized
  // Invite Member modal's Method A; optional everywhere else.
  employeeId: {
    type: String,
    trim: true,
    maxlength: 50,
    default: ''
  },
  // Unused in Phase 1 beyond being set to the creator on self-created
  // workspaces — present now so the deferred invitation phase doesn't need
  // a schema migration when it lands.
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

workspaceMembershipSchema.index({ workspace: 1, user: 1 }, { unique: true });
workspaceMembershipSchema.index({ user: 1, status: 1 });
workspaceMembershipSchema.index({ workspace: 1, role: 1 });

export default mongoose.model('WorkspaceMembership', workspaceMembershipSchema);
