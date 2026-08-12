import mongoose from 'mongoose';

/**
 * A pending request to join a workspace, created when a WorkspaceInvitation
 * flagged `requiresApproval` is accepted (see
 * modules/workspaces/invitationService.js #acceptInvitation and
 * modules/workspaces/joinRequestService.js). No WorkspaceMembership exists
 * yet — that's only created on approval.
 *
 * Not subject to workspaceScopePlugin — looked up explicitly by
 * {workspace, ...} or {user, ...}, the same convention as
 * WorkspaceMembership/WorkspaceInvitation.
 */
const workspaceJoinRequestSchema = new mongoose.Schema({
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
  // The invitation that spawned this request — every join request in this
  // system originates from an accepted invitation, never an uninvited
  // self-serve request.
  sourceInvitation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkspaceInvitation',
    required: true
  },
  requestedDepartment: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  }],
  requestedRole: {
    type: String,
    default: 'employee',
    lowercase: true,
    trim: true
  },
  requestedRoleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role'
  },
  message: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  rejectionReason: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },
  // Set on approval — the WorkspaceMembership this request resulted in.
  resultingMembership: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkspaceMembership',
    default: null
  }
}, { timestamps: true });

// "One active join request per user per workspace" — a partial unique index
// so only PENDING rows are constrained; approved/rejected history is kept
// and doesn't block a legitimate later re-request (e.g. rejected, then
// invited again).
workspaceJoinRequestSchema.index(
  { workspace: 1, user: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);
workspaceJoinRequestSchema.index({ workspace: 1, status: 1, createdAt: -1 }); // approval dashboard list
workspaceJoinRequestSchema.index({ user: 1, status: 1 });

export default mongoose.model('WorkspaceJoinRequest', workspaceJoinRequestSchema);
