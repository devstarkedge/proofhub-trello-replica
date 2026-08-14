import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import Workspace from '../models/Workspace.js';
import User from '../models/User.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import { findValidInvitationByToken, acceptInvitation } from '../modules/workspaces/invitationService.js';
import { invalidateAuthCache } from '../middleware/authMiddleware.js';
import { recordAuditLog } from '../modules/permissions/auditLogService.js';

// @desc    Validate an invitation token and return enough to render the
//          accept page — public, since a brand-new visitor with no account
//          yet must be able to see this before registering.
// @route   GET /api/invitations/:token
// @access  Public
export const getInvitationByToken = asyncHandler(async (req, res, next) => {
  const invitation = await findValidInvitationByToken(req.params.token);
  if (!invitation) {
    return next(new ErrorResponse('This invitation is invalid or has expired', 404));
  }

  // First-view only, guarded by openedAt — a repeat view/page-refresh/link-
  // preview-crawler hit on this public endpoint shouldn't spam the audit
  // trail with one row per hit.
  if (!invitation.openedAt) {
    invitation.openedAt = new Date();
    await invitation.save();
    await recordAuditLog({
      actor: null,
      actorEmail: invitation.email,
      action: 'INVITATION_OPENED',
      targetType: 'WorkspaceInvitation',
      targetId: invitation._id,
      resourceKey: 'workspace_member',
      resourceLabel: 'Workspace Members',
      summary: `Invitation link opened by ${invitation.email}`,
      category: 'workspace_member',
      meta: { workspaceId: invitation.workspace }
    });
  }

  const workspace = await workspaceContext.runUnscoped(async () => (
    Workspace.findById(invitation.workspace).select('name slug icon').lean()
  ));
  if (!workspace) {
    return next(new ErrorResponse('This invitation is invalid or has expired', 404));
  }

  const inviter = await User.findById(invitation.invitedBy).select('name').lean();
  const accountExists = !!(await User.findOne({ email: invitation.email }).select('_id').lean());

  res.status(200).json({
    success: true,
    data: {
      email: invitation.email,
      workspace: { _id: workspace._id, name: workspace.name, slug: workspace.slug, icon: workspace.icon || null },
      inviterName: inviter?.name || null,
      role: invitation.role,
      requiresApproval: invitation.requiresApproval,
      expiresAt: invitation.expiresAt,
      accountExists
    }
  });
});

// @desc    Accept an invitation as the currently authenticated user. The
//          authenticated email must match the invited email — an
//          invitation is bound to a specific address, not "whoever is
//          logged in when they click the link."
// @route   POST /api/invitations/:token/accept
// @access  Private
export const acceptWorkspaceInvitation = asyncHandler(async (req, res, next) => {
  const invitation = await findValidInvitationByToken(req.params.token);
  if (!invitation) {
    return next(new ErrorResponse('This invitation is invalid or has expired', 404));
  }

  if (invitation.email.toLowerCase() !== String(req.user.email || '').toLowerCase()) {
    return next(new ErrorResponse(
      'This invitation was sent to a different email address. Sign in with that email to accept it.',
      403
    ));
  }

  const result = await acceptInvitation(invitation._id, req.user.id);

  const workspace = await workspaceContext.runUnscoped(async () => (
    Workspace.findById(invitation.workspace).select('name slug icon').lean()
  ));

  // Pending-approval: no membership exists yet, so lastActiveWorkspace must
  // NOT point there — protect (authMiddleware.js) would find no active
  // membership on the user's very next request and 403 them.
  if (result.outcome === 'pending_approval') {
    return res.status(200).json({
      success: true,
      data: { outcome: 'pending_approval', workspace }
    });
  }

  await User.updateOne({ _id: req.user.id }, { $set: { lastActiveWorkspace: invitation.workspace } });
  invalidateAuthCache(req.user.id);

  res.status(200).json({
    success: true,
    data: {
      outcome: 'joined',
      workspace,
      role: result.membership.role
    }
  });
});
