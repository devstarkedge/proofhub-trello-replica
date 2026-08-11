import mongoose from 'mongoose';

/**
 * A pending invite to join a workspace, sent to an email with no existing
 * platform account yet. Token handling mirrors User.resetPasswordToken /
 * resetPasswordExpires (backend/controllers/authController.js's
 * forgotPassword/resetPassword): a random token is emailed in plaintext,
 * only its SHA-256 hash is ever persisted, and it's single-use — accepting
 * (or cancelling) clears nothing but flips `status`, since the row is kept
 * as an audit trail rather than deleted.
 *
 * Not subject to workspaceScopePlugin — looked up directly by {token} (a
 * brand-new visitor has no workspace context yet) or explicitly by
 * {workspace, ...}, the same convention as WorkspaceMembership/Workspace/User.
 */
const workspaceInvitationSchema = new mongoose.Schema({
  workspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
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
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tokenHash: {
    type: String,
    required: true,
    select: false
  },
  expiresAt: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'expired', 'cancelled'],
    default: 'pending'
  },
  acceptedAt: {
    type: Date,
    default: null
  },
  acceptedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, { timestamps: true });

// One live invite per (workspace, email) — re-inviting refreshes the
// existing pending row (see workspaceController.inviteWorkspaceMembers)
// rather than accumulating duplicates that could confuse "duplicate
// invitation" checks or list multiple valid links for the same address.
workspaceInvitationSchema.index({ workspace: 1, email: 1, status: 1 });
workspaceInvitationSchema.index({ tokenHash: 1 });
workspaceInvitationSchema.index({ expiresAt: 1 });

export default mongoose.model('WorkspaceInvitation', workspaceInvitationSchema);
