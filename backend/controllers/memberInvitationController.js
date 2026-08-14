import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import Workspace from '../models/Workspace.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import Department from '../models/Department.js';
import User from '../models/User.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import { createOrRestoreMembership, notifyMembershipAdded } from '../modules/workspaces/membershipCreation.js';
import {
  createOrRefreshInvitation,
  listInvitations,
  resendInvitation,
  revokeInvitation,
  dispatchInvitationEmail
} from '../modules/workspaces/invitationService.js';
import { addUserToDepartmentRoster } from '../modules/workspaces/departmentRosterSync.js';
import * as joinRequestService from '../modules/workspaces/joinRequestService.js';
import { hasWorkspacePermission } from '../modules/workspaces/workspacePermissions.js';
import { resolveAssignableRole } from '../modules/workspaces/roleTypeGuard.js';
import { recordAuditLog, queryAuditLog } from '../modules/permissions/auditLogService.js';
import logger from '../utils/logger.js';
import { sendDirectAddNewUserEmail, sendDirectAddExistingUserEmail, buildWorkspaceInviteEmail } from '../utils/email.js';

// @desc    Centralized Invite Member entry point — branches on `method`.
//          "direct": admin provisions the account/membership immediately
//          (no verification/approval — the org already vouches for them).
//          "self_register": sends a token-based invitation; accepting it
//          creates a pending WorkspaceJoinRequest instead of a membership
//          (see invitationService.js#acceptInvitation).
// @route   POST /api/workspaces/:id/invite-member
// @access  Private (requires canInviteMembers — see requireWorkspacePermission)
export const inviteMember = asyncHandler(async (req, res, next) => {
  const { method } = req.body;

  const workspace = await workspaceContext.runUnscoped(async () => Workspace.findById(req.params.id).lean());
  if (!workspace) {
    return next(new ErrorResponse('Workspace not found', 404));
  }

  if (method === 'direct') {
    return inviteMemberDirect(req, res, next, workspace);
  }
  if (method === 'self_register') {
    return inviteMemberSelfRegister(req, res, next, workspace);
  }
  if (method === 'bulk_simple') {
    return inviteMemberBulkSimple(req, res, next, workspace);
  }
  return next(new ErrorResponse('Unsupported invite method', 400));
});

async function inviteMemberDirect(req, res, next, workspace) {
  const {
    fullName, email: rawEmail, department: departmentId, role, employeeId,
    temporaryPassword, sendWelcomeEmail, requirePasswordChangeOnFirstLogin
  } = req.body;

  const email = String(rawEmail || '').trim().toLowerCase();
  if (!fullName || !email || !departmentId || !role || !temporaryPassword) {
    return next(new ErrorResponse('fullName, email, department, role and temporaryPassword are required', 400));
  }

  let roleDoc;
  try {
    roleDoc = await resolveAssignableRole({
      roleSlug: String(role).toLowerCase(),
      workspaceId: req.params.id,
      actingUser: req.user
    });
  } catch (err) {
    return next(err);
  }

  const departmentDoc = await workspaceContext.run({ workspaceId: req.params.id }, async () => (
    await Department.findById(departmentId).select('_id').lean()
  ));
  if (!departmentDoc) {
    return next(new ErrorResponse('Invalid department', 400));
  }

  const existingUser = await User.findOne({ email });

  if (existingUser) {
    const activeMembership = await WorkspaceMembership.findOne({
      workspace: req.params.id, user: existingUser._id, status: 'active'
    }).lean();
    if (activeMembership) {
      return next(new ErrorResponse('User already belongs to this workspace.', 400));
    }

    const { outcome, membership } = await createOrRestoreMembership({
      workspaceId: req.params.id,
      userId: existingUser._id,
      role: roleDoc.slug,
      roleId: roleDoc._id,
      invitedBy: req.user.id,
      department: [departmentId],
      employeeId: employeeId || ''
    });

    await addUserToDepartmentRoster(req.params.id, departmentId, existingUser._id, roleDoc.slug);
    notifyMembershipAdded(existingUser._id, req.params.id).catch((err) => (
      logger.error('Failed to emit membership-added event', { error: err.message, userId: String(existingUser._id), workspaceId: req.params.id })
    ));

    sendDirectAddExistingUserEmail(existingUser, { workspaceName: workspace.name }).catch((err) => (
      logger.error('Failed to send direct-add existing-user email', { error: err.message, userId: String(existingUser._id), workspaceId: req.params.id })
    ));

    await recordAuditLog({
      actor: req.user,
      action: 'MEMBER_ADDED_DIRECT',
      targetType: 'WorkspaceMembership',
      targetId: membership._id,
      resourceKey: 'workspace_member',
      resourceLabel: 'Workspace Members',
      summary: `${req.user.name} added ${existingUser.name} to ${workspace.name} directly`,
      category: 'workspace_member',
      meta: { workspaceId: req.params.id }
    });

    return res.status(201).json({
      success: true,
      data: { outcome, newUser: false, membership }
    });
  }

  const newUser = await User.create({
    name: fullName,
    email,
    password: temporaryPassword,
    role: roleDoc.slug,
    roleId: roleDoc._id,
    department: [departmentId],
    isVerified: true,
    forcePasswordChange: requirePasswordChangeOnFirstLogin !== false,
    // Without this, protect's workspace-resolution (authMiddleware.js) falls
    // through to the legacy default workspace on this user's first login —
    // which they aren't a member of — locking them out with a 403 before
    // they can even list their own workspaces. Matches the exact pattern
    // every other user-creation path in authController.js already follows.
    lastActiveWorkspace: req.params.id
  });

  const { outcome, membership } = await createOrRestoreMembership({
    workspaceId: req.params.id,
    userId: newUser._id,
    role: roleDoc.slug,
    roleId: roleDoc._id,
    invitedBy: req.user.id,
    department: [departmentId],
    employeeId: employeeId || ''
  });

  await addUserToDepartmentRoster(req.params.id, departmentId, newUser._id, roleDoc.slug);
  notifyMembershipAdded(newUser._id, req.params.id).catch((err) => (
    logger.error('Failed to emit membership-added event', { error: err.message, userId: String(newUser._id), workspaceId: req.params.id })
  ));

  if (sendWelcomeEmail !== false) {
    sendDirectAddNewUserEmail(newUser, { workspaceName: workspace.name, temporaryPassword }).catch((err) => (
      logger.error('Failed to send direct-add new-user email', { error: err.message, userId: String(newUser._id), workspaceId: req.params.id })
    ));
  }

  await recordAuditLog({
    actor: req.user,
    action: 'MEMBER_ADDED_DIRECT',
    targetType: 'WorkspaceMembership',
    targetId: membership._id,
    resourceKey: 'workspace_member',
    resourceLabel: 'Workspace Members',
    summary: `${req.user.name} created an account for ${newUser.name} and added them to ${workspace.name}`,
    category: 'workspace_member',
    meta: { workspaceId: req.params.id }
  });

  return res.status(201).json({
    success: true,
    data: { outcome, newUser: true, membership }
  });
}

async function inviteMemberSelfRegister(req, res, next, workspace) {
  const { email: rawEmail, department, role, personalMessage } = req.body;
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email) {
    return next(new ErrorResponse('email is required', 400));
  }

  const roleSlug = role ? String(role).toLowerCase() : 'employee';
  let roleDoc;
  try {
    roleDoc = await resolveAssignableRole({ roleSlug, workspaceId: req.params.id, actingUser: req.user });
  } catch (err) {
    return next(err);
  }

  // Mirrors inviteMemberDirect's own department check — this method used to
  // store whatever department id was submitted with no existence/ownership
  // check at all, which the workspaceScopePlugin can't catch on its own
  // since nothing ever queried it: a raw findById here is what actually
  // triggers the plugin's automatic workspaceId filter, turning a
  // cross-workspace id into a clean 400 instead of a silently-stored
  // dangling reference on the resulting WorkspaceJoinRequest/membership.
  if (department) {
    const departmentDoc = await workspaceContext.run({ workspaceId: req.params.id }, async () => (
      await Department.findById(department).select('_id').lean()
    ));
    if (!departmentDoc) {
      return next(new ErrorResponse('Invalid department', 400));
    }
  }

  // Mirrors inviteMemberDirect's existing-membership guard — this method
  // used to skip it entirely, so it would "invite" someone already active
  // in the workspace instead of telling the inviter that up front.
  const existingUser = await User.findOne({ email }).select('_id').lean();
  if (existingUser) {
    const activeMembership = await WorkspaceMembership.findOne({
      workspace: req.params.id, user: existingUser._id, status: 'active'
    }).lean();
    if (activeMembership) {
      return next(new ErrorResponse('User already belongs to this workspace.', 400));
    }
  }

  const { invitation, plaintextToken } = await createOrRefreshInvitation({
    workspaceId: req.params.id,
    email,
    role: roleDoc.slug,
    roleId: roleDoc._id,
    invitedBy: req.user.id,
    department: department ? [department] : [],
    personalMessage: personalMessage || '',
    requiresApproval: true
  });

  // Queued when Redis is available (durable, retried, rate-limited),
  // fire-and-forget otherwise — either way the invitation row (not the
  // email send) is the source of truth, so an SMTP hiccup must not fail a
  // request that already committed. The outcome is recorded on the
  // invitation for the Manage Invitations UI to surface.
  dispatchInvitationEmail(invitation._id, buildWorkspaceInviteEmail(email, {
    workspaceName: workspace.name,
    inviterName: req.user.name,
    token: plaintextToken,
    personalMessage: personalMessage || ''
  }));

  await recordAuditLog({
    actor: req.user,
    action: 'INVITATION_CREATED',
    targetType: 'WorkspaceInvitation',
    targetId: invitation._id,
    resourceKey: 'workspace_member',
    resourceLabel: 'Workspace Members',
    summary: `${req.user.name} sent a registration invitation to ${email} for ${workspace.name}`,
    category: 'workspace_member',
    meta: { workspaceId: req.params.id }
  });

  return res.status(200).json({ success: true, data: { email, status: 'invited' } });
}

// @desc    Bulk, role-less invite — the centralized-service replacement for
//          the retired legacy POST /api/workspaces/:id/invite endpoint.
//          Every email is invited (or added, if already a platform user) as
//          'employee', with no department. Existing callers (workspace
//          creation wizard, onboarding checklist) only ever collect email
//          addresses, so this exists to give them a centralized, audited,
//          permission-checked home rather than force a role/department
//          picker onto UI that was never designed to collect one.
// @route   POST /api/workspaces/:id/invite-member  { method: 'bulk_simple' }
// @access  Private (requires canInviteMembers)
async function inviteMemberBulkSimple(req, res, next, workspace) {
  const { emails, role, department: departmentId } = req.body;
  if (!Array.isArray(emails) || emails.length === 0) {
    return next(new ErrorResponse('emails must be a non-empty array', 400));
  }

  let roleDoc;
  try {
    roleDoc = await resolveAssignableRole({
      roleSlug: role ? String(role).toLowerCase() : 'employee',
      workspaceId: req.params.id,
      actingUser: req.user
    });
  } catch (err) {
    return next(err);
  }

  // Optional — a common department applied to every row in this batch (the
  // spec's "allowed common attributes" for bulk invite). Validated once,
  // same as inviteMemberDirect's single-department check.
  let department = [];
  if (departmentId) {
    const departmentDoc = await workspaceContext.run({ workspaceId: req.params.id }, async () => (
      await Department.findById(departmentId).select('_id').lean()
    ));
    if (!departmentDoc) {
      return next(new ErrorResponse('Invalid department', 400));
    }
    department = [departmentId];
  }

  const results = [];
  const seen = new Set();

  for (const rawEmail of emails) {
    const email = String(rawEmail || '').trim().toLowerCase();
    if (!email) {
      results.push({ email: rawEmail, outcome: 'invalid' });
      continue;
    }
    if (seen.has(email)) {
      results.push({ email, outcome: 'duplicate' });
      continue;
    }
    seen.add(email);

    const existingUser = await User.findOne({ email }).select('_id name').lean();

    if (existingUser) {
      const activeMembership = await WorkspaceMembership.findOne({
        workspace: req.params.id, user: existingUser._id, status: 'active'
      }).lean();
      if (activeMembership) {
        results.push({ email, outcome: 'already_member' });
        continue;
      }

      const { outcome, membership } = await createOrRestoreMembership({
        workspaceId: req.params.id,
        userId: existingUser._id,
        role: roleDoc.slug,
        roleId: roleDoc._id,
        invitedBy: req.user.id,
        department
      });

      if (department[0]) {
        await addUserToDepartmentRoster(req.params.id, department[0], existingUser._id, roleDoc.slug);
      }
      notifyMembershipAdded(existingUser._id, req.params.id).catch((err) => (
        logger.error('Failed to emit membership-added event', { error: err.message, userId: String(existingUser._id), workspaceId: req.params.id, source: 'bulk_simple' })
      ));
      sendDirectAddExistingUserEmail(existingUser, { workspaceName: workspace.name }).catch((err) => (
        logger.error('Failed to send direct-add existing-user email', { error: err.message, userId: String(existingUser._id), workspaceId: req.params.id, source: 'bulk_simple' })
      ));

      await recordAuditLog({
        actor: req.user,
        action: 'MEMBER_ADDED_DIRECT',
        targetType: 'WorkspaceMembership',
        targetId: membership._id,
        resourceKey: 'workspace_member',
        resourceLabel: 'Workspace Members',
        summary: `${req.user.name} added ${existingUser.name} to ${workspace.name}`,
        category: 'workspace_member',
        meta: { workspaceId: req.params.id }
      });

      results.push({ email, outcome, newUser: false });
      continue;
    }

    const { invitation, plaintextToken } = await createOrRefreshInvitation({
      workspaceId: req.params.id,
      email,
      role: roleDoc.slug,
      roleId: roleDoc._id,
      invitedBy: req.user.id,
      department,
      requiresApproval: false
    });

    // Queued when Redis is available — bulk sends are exactly what the
    // "must not block the UI while sending large volumes of email" spec
    // requirement is about; the rate-limited BullMQ worker (20/10s) also
    // protects the SMTP account from a burst this loop would otherwise
    // produce if every send were awaited inline.
    dispatchInvitationEmail(invitation._id, buildWorkspaceInviteEmail(email, {
      workspaceName: workspace.name,
      inviterName: req.user.name,
      token: plaintextToken,
      personalMessage: ''
    }));

    await recordAuditLog({
      actor: req.user,
      action: 'INVITATION_CREATED',
      targetType: 'WorkspaceInvitation',
      targetId: invitation._id,
      resourceKey: 'workspace_member',
      resourceLabel: 'Workspace Members',
      summary: `${req.user.name} invited ${email} to ${workspace.name}`,
      category: 'workspace_member',
      meta: { workspaceId: req.params.id }
    });

    results.push({ email, outcome: 'invited', newUser: true });
  }

  return res.status(200).json({ success: true, data: results });
}

// @desc    List pending (or filtered-status) join requests for the Approval Dashboard.
// @route   GET /api/workspaces/:id/join-requests?status=pending
// @access  Private (requires canApproveJoinRequests)
export const listJoinRequests = asyncHandler(async (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  const joinRequests = await joinRequestService.listJoinRequests(req.params.id, { status });
  res.status(200).json({ success: true, data: joinRequests });
});

// @desc    Approve a pending join request — creates the real membership,
//          optionally overriding the requested department/role first.
// @route   PATCH /api/workspaces/:id/join-requests/:requestId/approve
// @access  Private (requires canApproveJoinRequests)
export const approveJoinRequestHandler = asyncHandler(async (req, res) => {
  const { department, role } = req.body;
  const { membership, joinRequest } = await joinRequestService.approveJoinRequest(
    req.params.requestId, req.params.id, req.user, { department, role }
  );

  notifyMembershipAdded(joinRequest.user, req.params.id).catch((err) => (
    logger.error('Failed to emit membership-added event', { error: err.message, userId: String(joinRequest.user), workspaceId: req.params.id, source: 'approveJoinRequest' })
  ));

  res.status(200).json({ success: true, data: { membership, joinRequest } });
});

// @desc    Reject a pending join request. No membership is created.
// @route   PATCH /api/workspaces/:id/join-requests/:requestId/reject
// @access  Private (requires canApproveJoinRequests)
export const rejectJoinRequestHandler = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const { joinRequest } = await joinRequestService.rejectJoinRequest(
    req.params.requestId, req.params.id, req.user.id, reason
  );
  res.status(200).json({ success: true, data: { joinRequest } });
});

// @desc    The Invite Member system's own activity trail — visible to
//          either cohort that can act on it (inviters or approvers), not
//          gated behind the broader access_control.manage permission the
//          main Access & Permissions audit log uses.
// @route   GET /api/workspaces/:id/member-activity-log
// @access  Private (requires canInviteMembers OR canApproveJoinRequests)
export const getMemberActivityLog = asyncHandler(async (req, res, next) => {
  const canInvite = await hasWorkspacePermission(req.user.id, req.params.id, 'canInviteMembers');
  const canApprove = canInvite ? true : (
    await hasWorkspacePermission(req.user.id, req.params.id, 'canApproveJoinRequests')
  );
  if (!canInvite && !canApprove) {
    return next(new ErrorResponse('Missing permission: canInviteMembers or canApproveJoinRequests', 403));
  }

  const { cursor, limit, sort } = req.query;
  const result = await queryAuditLog({
    workspaceId: req.params.id,
    category: 'workspace_member',
    cursor,
    limit,
    sort
  });

  res.status(200).json({ success: true, ...result });
});

// @desc    List invitations for the Manage Invitations UI — workspace-scoped,
//          cursor-paginated, defaults to the Pending tab.
// @route   GET /api/workspaces/:id/invitations?status=pending&cursor=&limit=&search=&sort=
// @access  Private (requires canInviteMembers)
export const listInvitationsHandler = asyncHandler(async (req, res) => {
  const { status, cursor, limit, search, sort } = req.query;
  const result = await listInvitations({ workspaceId: req.params.id, status, cursor, limit, search, sort });
  res.status(200).json({ success: true, ...result });
});

// @desc    Reissue a pending/expired invitation with a fresh token and
//          expiry, and re-send the email.
// @route   PATCH /api/workspaces/:id/invitations/:invitationId/resend
// @access  Private (requires canInviteMembers)
export const resendInvitationHandler = asyncHandler(async (req, res) => {
  const { invitation, plaintextToken } = await resendInvitation({
    invitationId: req.params.invitationId,
    workspaceId: req.params.id,
    actor: req.user
  });

  const workspace = await workspaceContext.runUnscoped(async () => (
    Workspace.findById(req.params.id).select('name').lean()
  ));

  dispatchInvitationEmail(invitation._id, buildWorkspaceInviteEmail(invitation.email, {
    workspaceName: workspace?.name || 'the workspace',
    inviterName: req.user.name,
    token: plaintextToken,
    personalMessage: invitation.personalMessage || ''
  }));

  res.status(200).json({
    success: true,
    data: { email: invitation.email, status: invitation.status, expiresAt: invitation.expiresAt }
  });
});

// @desc    Revoke a pending/expired invitation — its link stops working
//          immediately.
// @route   PATCH /api/workspaces/:id/invitations/:invitationId/revoke
// @access  Private (requires canInviteMembers)
export const revokeInvitationHandler = asyncHandler(async (req, res) => {
  const { invitation } = await revokeInvitation({
    invitationId: req.params.invitationId,
    workspaceId: req.params.id,
    actor: req.user
  });

  res.status(200).json({ success: true, data: { email: invitation.email, status: invitation.status } });
});
