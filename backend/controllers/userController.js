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

// @desc    Get all users belonging to the active workspace
// @route   GET /api/users
// @access  Private/Admin
export const getUsers = asyncHandler(async (req, res, next) => {
  const { department, team, role, search } = req.query;

  // Scope to the caller's active workspace via WorkspaceMembership — User
  // itself is shared across every workspace a person belongs to, so it
  // carries no workspaceId to filter on directly. See
  // modules/workspaces/workspaceScopePlugin.js's doc comment for why User
  // is deliberately excluded from that plugin.
  const memberships = await WorkspaceMembership.find({ workspace: req.workspaceId, status: 'active' })
    .select('user role')
    .lean();
  const memberUserIds = memberships.map((m) => m.user);
  const roleByUser = new Map(memberships.map((m) => [String(m.user), m.role]));

  let query = { _id: { $in: memberUserIds } };

  if (department) query.department = department;
  if (team) query.team = team;
  if (role) query.role = role;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  const users = await User.find(query)
    .populate('department', 'name')
    .populate('team', 'name')
    .select('-password')
    .sort('name');

  // Overlay each user's workspace-specific role — User.role is only the
  // default-workspace mirror, and role assignments must be independent
  // per workspace (see WorkspaceMembership.role, kept in sync via
  // syncMembershipFromUser).
  const data = users.map((u) => {
    const obj = u.toObject();
    obj.role = roleByUser.get(String(u._id)) || obj.role;
    return obj;
  });

  res.status(200).json({
    success: true,
    data
  });
});

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private
export const getUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id)
    .populate('department', 'name')
    .populate('team', 'name')
    .select('-password');

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  if (!(await isActiveWorkspaceMember(user._id, req.workspaceId))) {
    return next(new ErrorResponse('User is not a member of this workspace', 403));
  }

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
  const result = await resolveResourceAccess(user, FINANCE_PAGE_KEY, req.workspaceId);
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

  const currentRole = normalizePermissionRole(user.role);
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
    user.role = requestedRole;
    user.roleId = roleDoc?._id || null;
    await user.save();
    await syncMembershipFromUser(user._id, req.workspaceId);
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
  const { name, email, role, department, team, isVerified, isActive } = req.body;

  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  if (!(await isActiveWorkspaceMember(user._id, req.workspaceId))) {
    return next(new ErrorResponse('User is not a member of this workspace', 403));
  }

  // Update fields
  if (name) user.name = name;
  if (email) user.email = email;
  // SECURITY: role changes must go through PUT /api/users/:id/role (changeUserRole),
  // which is admin-only, validates the target role, and blocks self-promotion.
  // This generic update endpoint is reachable by managers (ownerOrAdminManager),
  // so it must never accept a role change — allowing it previously let any manager
  // set their own (or anyone else's) role to 'admin' via this route.
  if (role && role.toLowerCase() !== user.role && req.user.role !== 'admin') {
    return next(new ErrorResponse('Only admins can change user roles. Use PUT /api/users/:id/role.', 403));
  }
  if (role && req.user.role === 'admin') {
    if (user._id.toString() === req.user.id) {
      return next(new ErrorResponse('Cannot change your own role', 403));
    }
    user.role = role;

    // Lookup roleId
    const Role = (await import('../models/Role.js')).default;
    const roleDoc = await Role.findResolvable(role.toLowerCase(), req.workspaceId);
    if (roleDoc) {
      user.roleId = roleDoc._id;
    } else {
      user.roleId = null;
    }
  }
  if (department !== undefined) user.department = department;
  if (team !== undefined) user.team = team;
  if (isVerified !== undefined && (req.user.role === 'admin' || req.user.role === 'manager')) user.isVerified = isVerified;
  if (isActive !== undefined && (req.user.role === 'admin' || req.user.role === 'manager')) user.isActive = isActive;

  await user.save();
  await syncMembershipFromUser(user._id, req.workspaceId);

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
export const deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Permission check: only admins can delete users
  if (req.user.role !== 'admin') {
    return next(new ErrorResponse('Only admins can delete users', 403));
  }

  // Prevent deletion of admin users
  if (user.role === 'admin') {
    return next(new ErrorResponse('Cannot delete admin users', 400));
  }

  // Import required models
  const Department = (await import('../models/Department.js')).default;
  const Team = (await import('../models/Team.js')).default;
  const Board = (await import('../models/Board.js')).default;
  const Card = (await import('../models/Card.js')).default;
  const Comment = (await import('../models/Comment.js')).default;
  const Notification = (await import('../models/Notification.js')).default;
  const Activity = (await import('../models/Activity.js')).default;

  // Remove user references from departments
  await Department.updateMany(
    { $or: [{ managers: req.params.id }, { members: req.params.id }] },
    { $pull: { managers: req.params.id, members: req.params.id } }
  );

  // Remove user references from teams
  await Team.updateMany(
    { $or: [{ owner: req.params.id }, { members: req.params.id }] },
    { $unset: { owner: null }, $pull: { members: req.params.id } }
  );

  // Remove user references from boards
  await Board.updateMany(
    { $or: [{ owner: req.params.id }, { members: req.params.id }] },
    { $unset: { owner: null }, $pull: { members: req.params.id } }
  );

  // Remove user references from cards
  await Card.updateMany(
    { assignees: req.params.id },
    { $pull: { assignees: req.params.id } }
  );

  // Delete comments by the user
  await Comment.deleteMany({ user: req.params.id });

  // Delete notifications involving the user
  await Notification.deleteMany({ $or: [{ user: req.params.id }, { sender: req.params.id }] });

  // Delete page/module permissions owned by the user (legacy tables kept
  // for historical record elsewhere, but per-user rows must go) and their
  // centralized AccessOverride rows (Sales, Finance, any future module).
  await UserPermission.deleteMany({ user: req.params.id });
  await AccessOverride.deleteMany({ user: req.params.id });

  // Delete activities by the user
  await Activity.deleteMany({ user: req.params.id });

  // Finally, delete the user
  chatHooks.onUserDeactivated(user).catch(console.error);
  await user.deleteOne();

  res.status(200).json({
    success: true,
    message: 'User deleted successfully'
  });
});

// @desc    Get current user profile
// @route   GET /api/users/profile
// @access  Private
export const getProfile = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id)
    .populate('department', 'name')
    .populate('team', 'name')
    .select('-password');

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Update current user profile
// @route   PUT /api/users/profile
// @access  Private
export const updateProfile = asyncHandler(async (req, res, next) => {
  const { name, email, title } = req.body;

  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Check if email is being changed and if it's already taken
  if (email && email !== user.email) {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return next(new ErrorResponse('Email already in use', 400));
    }
  }

  // Update fields
  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;
  if (title !== undefined) user.title = title;

  await user.save();

  // Populate department and team for response
  await user.populate('department', 'name');
  await user.populate('team', 'name');

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Get all verified users for announcements
// @route   GET /api/users/verified
// @access  Private/Admin
export const getVerifiedUsers = asyncHandler(async (req, res, next) => {
  const memberUserIds = await WorkspaceMembership.find({ workspace: req.workspaceId, status: 'active' }).distinct('user');

  const users = await User.find({
    _id: { $in: memberUserIds },
    isVerified: true,
    isActive: true
  })
    .populate('department', 'name')
    .select('name email avatar department role')
    .sort('name');

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
  const memberUserIds = await WorkspaceMembership.find({ workspace: req.workspaceId, status: 'active' }).distinct('user');

  const users = await User.find({
    _id: { $in: memberUserIds },
    department: { $in: departmentIds },
    isVerified: true,
    isActive: true
  })
    .populate('department', 'name')
    .select('name email avatar department role')
    .sort('name');

  res.status(200).json({
    success: true,
    data: users
  });
});

// @desc    Get all manager users for announcements
// @route   GET /api/users/managers
// @access  Private/Admin
export const getManagerUsers = asyncHandler(async (req, res, next) => {
  const memberUserIds = await WorkspaceMembership.find({ workspace: req.workspaceId, status: 'active' }).distinct('user');

  const users = await User.find({
    _id: { $in: memberUserIds },
    role: { $in: ['admin', 'manager'] },
    isVerified: true,
    isActive: true
  })
    .populate('department', 'name')
    .select('name email avatar department role')
    .sort('name');

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
  // Strict Role Check - Admin Only
  if (req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to verify users. Admin access required.', 403));
  }

  const { role, department } = req.body;

  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Update verification status and role/department if provided
  user.isVerified = true;
  if (role) {
    user.role = role;
    
    // Lookup roleId
    const Role = (await import('../models/Role.js')).default;
    const roleDoc = await Role.findResolvable(role.toLowerCase(), req.workspaceId);
    if (roleDoc) {
      user.roleId = roleDoc._id;
    }
  }
  if (department !== undefined) user.department = department; // Allow null to remove department

  await user.save();
  await syncMembershipFromUser(user._id, req.workspaceId);

  // Respond immediately for fast UI
  res.status(200).json({
    success: true,
    data: user
  });

  // Run non-blocking background tasks
  const { runBackground } = await import('../utils/backgroundTasks.js');
  
  runBackground(async () => {
    try {
      // Emit real-time update via socket to all connected admin and manager users
      const { emitToUser } = await import('../server.js');
      emitToUser(user._id.toString(), 'user-verified', {
        userId: user._id,
        isVerified: true,
        role: user.role,
        department: user.department
      });

      // Also emit to admin and manager users who might be viewing the HR panel
      const { emitToTeam } = await import('../server.js');
      
      // Emit to admins
      emitToTeam('admin', 'user-verified', {
        userId: user._id,
        isVerified: true,
        role: user.role,
        department: user.department
      });
      
      // Emit to managers
      emitToTeam('manager', 'user-verified', {
        userId: user._id,
        isVerified: true,
        role: user.role,
        department: user.department
      });

      // Send verification email
      await sendVerificationEmail(user);

      // Notify admins and managers about new user verification — scoped to
      // THIS workspace's admins/managers only (was previously every
      // workspace's, via an unscoped global User.role query).
      const authorizedMemberships = await WorkspaceMembership.find({
        workspace: req.workspaceId,
        role: { $in: ['admin', 'manager'] },
        status: 'active'
      }).select('user').lean();
      const authorizedUsers = await User.find({
        _id: { $in: authorizedMemberships.map((m) => m.user) },
        isActive: true
      }).select('_id');
      const authorizedIds = authorizedUsers.map(u => u._id);
      await notificationService.notifyUserVerified(user, authorizedIds);

      // Dispatch chat webhook for user verification
      chatHooks.onUserVerified(user).catch(console.error);
    } catch (error) {
      console.error('Background verification tasks failed:', error);
    }
  });
});

// @desc    Decline user registration (Admin only)
// @route   DELETE /api/users/:id/decline
// @access  Private/Admin
export const declineUser = asyncHandler(async (req, res, next) => {
  // Strict Role Check - Admin Only
  if (req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to decline users. Admin access required.', 403));
  }

  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Only allow declining unverified users
  if (user.isVerified) {
    return next(new ErrorResponse('Cannot decline a verified user', 400));
  }

  await user.deleteOne();

  res.status(200).json({
    success: true,
    message: 'User registration declined and data deleted successfully'
  });
});

// @desc    Assign Employee to department/team
// @route   PUT /api/users/:id/assign
// @access  Private/Admin
export const assignUser = asyncHandler(async (req, res, next) => {
  const { departments, team, accessType, allowedProjects } = req.body;

  // SECURITY: no one may change their own department/access-scope through
  // this endpoint — including Admin. Mirrors the same rule enforced for
  // role changes (below) and resource overrides (accessControlService).
  if (req.user.id === req.params.id) {
    return next(new ErrorResponse('You cannot modify your own access.', 403));
  }

  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  if (!(await isActiveWorkspaceMember(user._id, req.workspaceId))) {
    return next(new ErrorResponse('User is not a member of this workspace', 403));
  }

  const before = {
    department: (user.department || []).map((d) => d.toString()),
    accessType: user.accessType,
    allowedProjects: (user.allowedProjects || []).map((p) => p.toString())
  };

  if (departments !== undefined) {
    user.department = departments; // Assign the array of department IDs

    // Add user to appropriate department array based on role
    if (departments && departments.length > 0) {
      const Department = (await import('../models/Department.js')).default;
      for (const deptId of departments) {
        const dept = await Department.findById(deptId);
        if (dept) {
          // Determine which array to add user to based on role
          const isManagerRole = user.role === 'admin' || user.role === 'manager';
          const targetArray = isManagerRole ? 'managers' : 'members';
          const oppositeArray = isManagerRole ? 'members' : 'managers';

          // Remove from opposite array if present
          if (dept[oppositeArray].includes(req.params.id)) {
            dept[oppositeArray] = dept[oppositeArray].filter(id => id.toString() !== req.params.id);
          }

          // Add to target array if not already present
          if (!dept[targetArray].includes(req.params.id)) {
            dept[targetArray].push(req.params.id);
          }

          await dept.save();
        }
      }
    }
  }

  if (team !== undefined) user.team = team;

  // ── Access Scope Enforcement ──────────────────────────────────────────────
  // Employees MUST use assignment-based scope — they cannot have department-wide visibility.
  const isEmployee = user.role === 'employee';

  if (isEmployee) {
    // Force assignment scope regardless of what the payload says
    user.accessType = 'assigned_tasks';
    user.allowedProjects = [];
  } else {
    const validAccessTypes = ['full_department', 'selected_projects', 'assigned_tasks'];
    if (accessType !== undefined && validAccessTypes.includes(accessType)) {
      user.accessType = accessType;
    }
    if (allowedProjects !== undefined) {
      user.allowedProjects = Array.isArray(allowedProjects) ? allowedProjects : [];
    }
  }

  await user.save();
  await syncMembershipFromUser(user._id, req.workspaceId);

  // Emit real-time event to the affected user so their UI refreshes without reload
  emitToUser(req.params.id, 'user:access-updated', {
    accessType: user.accessType,
    allowedProjects: user.allowedProjects,
    departments: user.department
  });

  (async () => {
    const after = {
      department: (user.department || []).map((d) => d.toString()),
      accessType: user.accessType,
      allowedProjects: (user.allowedProjects || []).map((p) => p.toString())
    };

    const changeDetails = [];
    if (before.accessType !== after.accessType) {
      changeDetails.push({ label: 'Access Scope', previous: ACCESS_SCOPE_LABELS[before.accessType] || before.accessType, next: ACCESS_SCOPE_LABELS[after.accessType] || after.accessType });
    }
    if (JSON.stringify([...before.department].sort()) !== JSON.stringify([...after.department].sort())) {
      const Department = (await import('../models/Department.js')).default;
      const deptIds = [...new Set([...before.department, ...after.department])];
      const depts = await Department.find({ _id: { $in: deptIds } }).select('name').lean();
      const nameOf = (id) => depts.find((d) => d._id.toString() === id)?.name || id;
      changeDetails.push({
        label: 'Departments',
        previous: before.department.map(nameOf),
        next: after.department.map(nameOf)
      });
    }

    if (changeDetails.length === 0) return;

    await recordAuditLog({
      actor: req.user,
      target: user,
      action: 'ACCESS_SCOPE_UPDATED',
      targetType: 'User',
      targetId: user._id,
      resourceKey: 'access_scope',
      resourceLabel: 'Access Scope & Departments',
      summary: `${req.user.name} updated access scope for ${user.name}`,
      changeDetails,
      before,
      after,
      meta: { ip: req.ip, userAgent: req.headers['user-agent'] }
    });
  })().catch((err) => console.error('Failed to record access-scope audit log:', err));

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Change user's role
// @route   PUT /api/users/:id/role
// @access  Private/Admin
export const changeUserRole = asyncHandler(async (req, res, next) => {
  const { role } = req.body;

  if (!role || typeof role !== 'string') {
    return next(new ErrorResponse('Role is required', 400));
  }

  const normalizedRole = role.toLowerCase().trim();

  // Validate against known roles
  const Role = (await import('../models/Role.js')).default;
  const roleDoc = await Role.findResolvable(normalizedRole, req.workspaceId);
  if (!roleDoc) {
    return next(new ErrorResponse('Invalid role', 400));
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  if (!(await isActiveWorkspaceMember(user._id, req.workspaceId))) {
    return next(new ErrorResponse('User is not a member of this workspace', 403));
  }

  // Prevent changing own role
  if (user._id.toString() === req.user.id) {
    return next(new ErrorResponse('Cannot change your own role', 403));
  }

  // SECURITY: this route now also accepts a non-admin delegated via
  // access_control.manage (allowRolesOrAccessControlManage in routes/users.js),
  // so it can no longer assume every caller is a real Admin. Delegation is
  // meant to let someone manage roles/permissions/users — not mint or edit
  // Admins. Only a genuine Admin may promote a user to 'admin' or change an
  // existing admin's role.
  const requesterIsRealAdmin = req.user.role === 'admin';
  if (!requesterIsRealAdmin && (normalizedRole === 'admin' || user.role === 'admin')) {
    return next(new ErrorResponse('Only an Admin can grant or change Admin access', 403));
  }

  const previousRole = user.role;
  if (previousRole === normalizedRole) {
    return res.status(200).json({ success: true, data: user, message: 'Role unchanged' });
  }

  user.role = normalizedRole;
  user.roleId = roleDoc._id;

  // ── Access Scope Enforcement on Role Change ───────────────────────────────
  // When a user is downgraded to employee, force assignment-based scope.
  // When a user is promoted from employee, set a sensible default.
  if (normalizedRole === 'employee') {
    user.accessType = 'assigned_tasks';
    user.allowedProjects = [];
  } else if (previousRole === 'employee' && normalizedRole !== 'employee') {
    // Promoted from employee — give department-wide access by default
    user.accessType = 'full_department';
  }

  await user.save();
  await syncMembershipFromUser(user._id, req.workspaceId);

  res.status(200).json({
    success: true,
    data: user
  });

  recordAuditLog({
    actor: req.user,
    target: user,
    action: 'ROLE_CHANGED',
    targetType: 'User',
    targetId: user._id,
    resourceKey: 'role_assignment',
    resourceLabel: 'Role Assignment',
    summary: `${req.user.name} changed ${user.name}'s role from "${previousRole}" to "${normalizedRole}"`,
    changeDetails: [{ label: 'Role', previous: previousRole, next: normalizedRole }],
    before: { role: previousRole },
    after: { role: normalizedRole },
    meta: { ip: req.ip, userAgent: req.headers['user-agent'], workspaceId: req.workspaceId }
  }).catch(() => {});

  // Emit real-time role change in background
  const { runBackground } = await import('../utils/backgroundTasks.js');
  runBackground(async () => {
    try {
      const { emitToUser, emitToTeam } = await import('../server.js');

      const payload = {
        userId: user._id,
        previousRole,
        newRole: normalizedRole,
        roleId: roleDoc._id
      };

      // Notify the affected user
      emitToUser(user._id.toString(), 'user-role-changed', payload);

      // Notify admins viewing HR panel
      emitToTeam('admin', 'user-role-changed', payload);

      // Sync role change to Chat App
      chatHooks.onUserUpdated(user, { role: { old: previousRole, new: normalizedRole } }, req.user).catch(console.error);
    } catch (err) {
      console.error('Error emitting role change socket event:', err);
    }
  });
});
