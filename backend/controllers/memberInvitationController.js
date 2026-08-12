import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import Workspace from '../models/Workspace.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import Department from '../models/Department.js';
import Role from '../models/Role.js';
import User from '../models/User.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import { createOrRestoreMembership, notifyMembershipAdded } from '../modules/workspaces/membershipCreation.js';
import { createOrRefreshInvitation } from '../modules/workspaces/invitationService.js';
import { addUserToDepartmentRoster } from '../modules/workspaces/departmentRosterSync.js';
import * as joinRequestService from '../modules/workspaces/joinRequestService.js';
import { hasWorkspacePermission } from '../modules/workspaces/workspacePermissions.js';
import { recordAuditLog, queryAuditLog } from '../modules/permissions/auditLogService.js';
import { sendDirectAddNewUserEmail, sendDirectAddExistingUserEmail, sendWorkspaceInviteEmail } from '../utils/email.js';

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

  const roleDoc = await workspaceContext.run({ workspaceId: req.params.id }, async () => (
    await Role.findResolvable(String(role).toLowerCase(), req.params.id)
  ));
  if (!roleDoc) {
    return next(new ErrorResponse('Invalid role', 400));
  }

  // A non-admin holding only canInviteMembers must not be able to mint new
  // admins through this modal — mirrors userController.js's "only a genuine
  // Admin may grant Admin access" rule.
  if (roleDoc.slug === 'admin' && req.user.role !== 'admin') {
    return next(new ErrorResponse('Only an Admin can grant Admin access', 403));
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
      console.error('Failed to emit membership-added event:', err)
    ));

    sendDirectAddExistingUserEmail(existingUser, { workspaceName: workspace.name }).catch((err) => (
      console.error('Failed to send direct-add existing-user email:', err.message)
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
    console.error('Failed to emit membership-added event:', err)
  ));

  if (sendWelcomeEmail !== false) {
    sendDirectAddNewUserEmail(newUser, { workspaceName: workspace.name, temporaryPassword }).catch((err) => (
      console.error('Failed to send direct-add new-user email:', err.message)
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
  const roleDoc = await workspaceContext.run({ workspaceId: req.params.id }, async () => (
    await Role.findResolvable(roleSlug, req.params.id)
  ));
  if (!roleDoc) {
    return next(new ErrorResponse('Invalid role', 400));
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

  await sendWorkspaceInviteEmail(email, {
    workspaceName: workspace.name,
    inviterName: req.user.name,
    token: plaintextToken,
    personalMessage: personalMessage || ''
  });

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
    req.params.requestId, req.params.id, req.user.id, { department, role }
  );

  notifyMembershipAdded(joinRequest.user, req.params.id).catch((err) => (
    console.error('Failed to emit membership-added event:', err)
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
