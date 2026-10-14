import { workspacePeople } from '../services/workspaceAudience.js';
import { requestEmailChange } from '../services/emailChangeService.js';
import { literalSearch } from '../utils/literalSearch.js';
import { updateMemberAccess } from '../authz/accessAdminService.js';
import { strictUpdate } from '../utils/strictUpdate.js';
import User from '../models/User.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import Role from '../models/Role.js';
import UserPermission, {
  FINANCE_PAGE_KEY,
  FULL_FINANCE_PERMISSIONS,
  normalizePermissionRole
} from '../models/UserPermission.js';
import AccessOverride from '../models/AccessOverride.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import { sendVerificationEmail } from '../utils/email.js';
import notificationService from '../utils/notificationService.js';
import { chatHooks } from '../utils/chatHooks.js';
import { invalidateAuthCache } from '../middleware/authMiddleware.js';
import { emitToUser } from '../realtime/index.js';
import { resolveResourceAccess } from '../modules/permissions/permissionEngine.js';
import { setResourceOverride } from '../modules/permissions/accessControlService.js';
import { toLegacyShape, fromLegacyShape } from '../config/permissionRegistry.js';
import { recordAuditLog } from '../modules/permissions/auditLogService.js';
import { syncMembershipFromUser, isActiveWorkspaceMember } from '../modules/workspaces/membershipSyncService.js';
import { assertCustomRoleAssignable } from '../modules/workspaces/roleTypeGuard.js';
import { publishUserProfileUpdate } from '../services/chat/userProfileSync.js';

const ROLE_OPTIONS_FOR_FINANCE_ACCESS = ['admin', 'manager', 'employee', 'hr'];

const ACCESS_SCOPE_LABELS = {
  full_department: 'Full Dept',
  selected_projects: 'Selected',
  assigned_tasks: 'My Tasks'
};

const normalizePageKey = (pageKey) => String(pageKey || FINANCE_PAGE_KEY).toLowerCase().trim();

const isSameUserId = (left, right) => {
  if (!left || !right) return false;
  return left.toString() === right.toString();
};

const buildPermissionUserPayload = (user) => ({
  _id: user._id,
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  avatar: user.avatar
});

async function workspaceUserProfile(userId, workspaceId, self = false) {
  const membership = await WorkspaceMembership.findOne({ user: userId, workspace: workspaceId, status: 'active' })
    .populate('department', 'name').populate('team', 'name').lean();
  if (!membership) throw new ErrorResponse('Member not found', 404);
  const user = await User.findById(userId).select(self ? 'name email avatar title isVerified isActive settings forcePasswordChange isSuperAdmin createdAt' : 'name email avatar title isVerified').lean();
  if (!user) throw new ErrorResponse('Member not found', 404);
  return { ...user, workspaceId, role: membership.role, roleId: membership.roleId, department: membership.department || [], team: membership.team || null, accessType: membership.accessType, allowedProjects: membership.allowedProjects || [] };
}

// @desc    Get all users belonging to the active workspace
// @route   GET /api/users
// @access  Private/Admin
export const getUsers = asyncHandler(async (req, res, next) => {
  const { department, team, role, search } = req.query;
  const filter = {};
  if (department) filter.department = department;
  if (team) filter.team = team;
  if (role) filter.role = role;
  let data = await workspacePeople(filter, req.workspaceId);
  if (search) { const regex = literalSearch(search); data = data.filter(u => regex.test(u.name) || regex.test(u.email)); }
  res.json({ success: true, data });
});

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private
export const getUser = asyncHandler(async (req, res, next) => {
  const user = await workspaceUserProfile(req.params.id, req.workspaceId);
  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Get page permissions for a user
// @route   GET /api/users/:id/permissions
// @access  Private/Self or Admin
export const getUserPagePermissions = asyncHandler(async (req, res, next) => {
  const pageKey = normalizePageKey(req.query.pageKey);
  const requesterRole = normalizePermissionRole(req.user.role);
  const requesterId = req.user._id || req.user.id;

  if (pageKey !== FINANCE_PAGE_KEY) {
    return next(new ErrorResponse('Unsupported permission page key', 400));
  }

  if (requesterRole !== 'admin' && !isSameUserId(requesterId, req.params.id)) {
    return next(new ErrorResponse('Not authorized to view these permissions', 403));
  }

  const user = await User.findById(req.params.id).select('name email role avatar');

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Delegates to the centralized permission engine (resource: 'finance')
  // instead of reading the UserPermission model directly.
  const result = await resolveResourceAccess({ ...user.toObject(), role: (await WorkspaceMembership.findOne({ user: user._id, workspace: req.workspaceId, status: 'active' }).lean())?.role }, FINANCE_PAGE_KEY, req.workspaceId);
  const permissions = {
    pageKey,
    ...toLegacyShape(FINANCE_PAGE_KEY, result.actions),
    locked: result.source === 'admin'
  };

  res.status(200).json({
    success: true,
    data: {
      user: buildPermissionUserPayload(user),
      permissions
    }
  });
});

// @desc    Update page permissions for a user
// @route   PATCH /api/users/:id/permissions
// @access  Private/Admin
export const patchUserPagePermissions = asyncHandler(async (req, res, next) => {
  const pageKey = normalizePageKey(req.body.pageKey || req.query.pageKey);
  const requesterRole = normalizePermissionRole(req.user.role);
  const requesterId = req.user._id || req.user.id;

  if (pageKey !== FINANCE_PAGE_KEY) {
    return next(new ErrorResponse('Unsupported permission page key', 400));
  }

  if (requesterRole !== 'admin') {
    return next(new ErrorResponse('Only admins can update user permissions', 403));
  }

  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  if (!(await isActiveWorkspaceMember(user._id, req.workspaceId))) {
    return next(new ErrorResponse('User is not a member of this workspace', 403));
  }

  const membership = await WorkspaceMembership.findOne({ workspace: req.workspaceId, user: user._id, status: 'active' }).lean();
  const currentRole = normalizePermissionRole(membership.role);
  const requestedRole = req.body.role !== undefined
    ? normalizePermissionRole(req.body.role)
    : currentRole;

  if (!ROLE_OPTIONS_FOR_FINANCE_ACCESS.includes(requestedRole)) {
    return next(new ErrorResponse('Invalid role for finance access control', 400));
  }

  const roleChanged = requestedRole !== currentRole;

  if (roleChanged) {
    if (isSameUserId(requesterId, user._id)) {
      return next(new ErrorResponse('You cannot change your own role from the finance access modal', 403));
    }

    const roleDoc = await Role.findResolvable(requestedRole, req.workspaceId);
    await updateMemberAccess({ workspaceId: req.workspaceId, userId: user._id, actor: req.user, patch: { role: requestedRole, roleId: roleDoc?._id } });
  }

  // Delegates to the centralized permission engine (resource: 'finance').
  // Admin needs no override — the resolver already grants full access to
  // any admin — so only write an override for non-admin target roles.
  let permissions;
  if (requestedRole === 'admin') {
    permissions = { pageKey, ...FULL_FINANCE_PERMISSIONS, locked: true };
  } else {
    const actions = fromLegacyShape(FINANCE_PAGE_KEY, {
      hasAccess: req.body.hasAccess === true,
      revenueAnalytics: req.body.revenueAnalytics === true,
      billingDetails: req.body.billingDetails === true
    });
    const { legacyPermissions } = await setResourceOverride(
      user._id,
      FINANCE_PAGE_KEY,
      { actions, effect: 'grant' },
      req.user,
      { ip: req.ip, userAgent: req.headers['user-agent'], workspaceId: req.workspaceId }
    );
    permissions = { pageKey, ...legacyPermissions, locked: false };
  }

  const responseUser = buildPermissionUserPayload(user);

  res.status(200).json({
    success: true,
    message: 'Permissions updated successfully',
    data: {
      user: responseUser,
      permissions
    }
  });

  // setResourceOverride already emitted 'finance:permissions:updated' for the
  // non-admin case above — only the role-change event remains here.
  if (roleChanged) {
    try {
      emitToUser(user._id.toString(), 'user-role-changed', {
        userId: user._id,
        previousRole: currentRole,
        newRole: requestedRole,
        roleId: user.roleId
      });
    } catch (emitErr) {
      console.error('Error emitting role change update:', emitErr);
    }
  }
});

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
export const updateUser = asyncHandler(async (req, res, next) => {
  const fields = strictUpdate(req.body, ['name', 'title']);
  if (!await isActiveWorkspaceMember(req.params.id, req.workspaceId)) throw new ErrorResponse('Member not found', 404);
  const user = await User.findById(req.params.id);
  if (!user) throw new ErrorResponse('Member not found', 404);
  const previousProfile = { name: user.name, email: user.email, avatar: user.avatar };
  Object.assign(user, fields);
  await user.save();
  await publishUserProfileUpdate(user, previousProfile, req.user, req.workspaceId);
  res.json({ success: true, data: { _id: user._id, name: user.name, title: user.title, avatar: user.avatar } });
});

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
export const deleteUser = asyncHandler(async (req, res, next) => {
  await updateMemberAccess({ workspaceId: req.workspaceId, userId: req.params.id, actor: req.user, patch: { status: 'removed' }, reason: 'Member removed from workspace' });
  res.json({ success: true, message: 'Member removed from workspace' });
});

// @desc    Get current user profile
// @route   GET /api/users/profile
// @access  Private
export const getProfile = asyncHandler(async (req, res, next) => {
  const user = req.user.isSuperAdmin && !req.workspaceId
    ? { ...await User.findById(req.user.id).select('name email avatar title settings forcePasswordChange isSuperAdmin').lean(), role: null, department: [], team: null, allowedProjects: [] }
    : await workspaceUserProfile(req.user.id, req.workspaceId, true);

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Update current user profile
// @route   PUT /api/users/profile
// @access  Private
export const updateProfile = asyncHandler(async (req, res, next) => {
  strictUpdate(req.body, ['name', 'email', 'title']);
  const { name, email, title } = req.body;

  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const emailChangePending = email && email !== user.email ? await requestEmailChange(req.user.id, email) : false;

  // Update fields
  const previousProfile = { name: user.name, email: user.email, avatar: user.avatar };
  if (name !== undefined) user.name = name;

  if (title !== undefined) user.title = title;

  await user.save();

  await publishUserProfileUpdate(user, previousProfile, req.user, req.workspaceId);

  const profile = await workspaceUserProfile(req.user.id, req.workspaceId, true);

  res.status(200).json({
    success: true,
    emailChangePending: Boolean(emailChangePending),
    data: profile
  });
});

// @desc    Get all verified users for announcements
// @route   GET /api/users/verified
// @access  Private/Admin
export const getVerifiedUsers = asyncHandler(async (req, res, next) => {
  const users = (await workspacePeople({}, req.workspaceId)).filter(u => u.isVerified).sort((a,b) => a.name.localeCompare(b.name));

  res.status(200).json({
    success: true,
    data: users
  });
});

// @desc    Get users by departments for announcements
// @route   GET /api/users/by-departments
// @access  Private/Admin
export const getUsersByDepartments = asyncHandler(async (req, res, next) => {
  const { departments } = req.query;

  if (!departments) {
    return next(new ErrorResponse('Departments parameter is required', 400));
  }

  const departmentIds = Array.isArray(departments) ? departments : departments.split(',');
  const users = (await workspacePeople({ department: { $in: departmentIds } }, req.workspaceId)).filter(u => u.isVerified).sort((a,b) => a.name.localeCompare(b.name));

  res.status(200).json({
    success: true,
    data: users
  });
});

// @desc    Get all manager users for announcements
// @route   GET /api/users/managers
// @access  Private/Admin
export const getManagerUsers = asyncHandler(async (req, res, next) => {
  const users = (await workspacePeople({ role: { $in: ['admin', 'manager'] } }, req.workspaceId)).filter(u => u.isVerified).sort((a,b) => a.name.localeCompare(b.name));

  res.status(200).json({
    success: true,
    data: users
  });
});

// @desc    Update current user settings
// @route   PUT /api/users/settings
// @access  Private
export const updateSettings = asyncHandler(async (req, res, next) => {
  const { notifications, currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user.id).select('+password');

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // If changing password, verify current password
  if (newPassword) {
    if (!currentPassword) {
      return next(new ErrorResponse('Current password is required to change password', 400));
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return next(new ErrorResponse('Current password is incorrect', 400));
    }

    if (newPassword === currentPassword) {
      return next(new ErrorResponse('New password cannot be the same as the current password', 400));
    }

    user.password = newPassword;
  }

  // Update settings
  if (notifications !== undefined) {
    user.settings.notifications = { ...user.settings.notifications, ...notifications };
  }

  await user.save();

  // Remove password from response
  const userResponse = user.toObject();
  delete userResponse.password;

  res.status(200).json({
    success: true,
    data: userResponse
  });
});

// @desc    Verify user (Admin only)
// @route   PUT /api/users/:id/verify
// @access  Private/Admin
export const verifyUser = asyncHandler(async (req, res, next) => {
  const { approveJoinRequest } = await import('../modules/workspaces/joinRequestService.js');
  const { default: JoinRequest } = await import('../models/WorkspaceJoinRequest.js');
  const pending = await JoinRequest.findOne({ workspace: req.workspaceId, user: req.params.id, status: 'pending' });
  if (!pending) throw new ErrorResponse('Pending join request not found', 404);
  const data = await approveJoinRequest(pending._id, req.workspaceId, req.user, { role: req.body.role });
  res.json({ success: true, data });
});

// @desc    Decline user registration (Admin only)
// @route   DELETE /api/users/:id/decline
// @access  Private/Admin
export const declineUser = asyncHandler(async (req, res, next) => {
  const { rejectJoinRequest } = await import('../modules/workspaces/joinRequestService.js');
  const { default: JoinRequest } = await import('../models/WorkspaceJoinRequest.js');
  const pending = await JoinRequest.findOne({ workspace: req.workspaceId, user: req.params.id, status: 'pending' });
  if (!pending) throw new ErrorResponse('Pending join request not found', 404);
  const data = await rejectJoinRequest(pending._id, req.workspaceId, req.user.id, req.body.reason || 'Registration declined');
  res.json({ success: true, data });
});

// @desc    Assign Employee to department/team
// @route   PUT /api/users/:id/assign
// @access  Private/Admin
export const assignUser = asyncHandler(async (req, res, next) => {
  strictUpdate(req.body, ['departments', 'team', 'accessType', 'allowedProjects']);
  const patch = Object.fromEntries(Object.entries(req.body).map(([key, value]) => [key === 'departments' ? 'department' : key, value]));
  await updateMemberAccess({ workspaceId: req.workspaceId, userId: req.params.id, actor: req.user, patch });
  const user = await workspaceUserProfile(req.params.id, req.workspaceId);
  res.json({ success: true, data: user });
});

// @desc    Change user's role
// @route   PUT /api/users/:id/role
// @access  Private/Admin
export const changeUserRole = asyncHandler(async (req, res, next) => {
  const { resolveAssignableRole } = await import('../modules/workspaces/roleTypeGuard.js');
  const roleDoc = await resolveAssignableRole({ workspaceId: req.workspaceId, roleSlug: req.body.role, actingUser: req.user });
  const member = await updateMemberAccess({ workspaceId: req.workspaceId, userId: req.params.id, actor: req.user, patch: { role: roleDoc.slug, roleId: roleDoc._id } });
  const user = await User.findById(req.params.id).select('name email avatar').lean();
  res.json({ success: true, data: { ...user, role: member.role, roleId: member.roleId } });
});
