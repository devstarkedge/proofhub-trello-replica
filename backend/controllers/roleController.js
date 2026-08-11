import Role from '../models/Role.js';
import User from '../models/User.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import { recordAuditLog } from '../modules/permissions/auditLogService.js';

let permissionLabelByKeyCache = null;
const permissionLabelByKey = (key) => {
  if (!permissionLabelByKeyCache) {
    permissionLabelByKeyCache = Object.values(PERMISSION_DEFINITIONS)
      .flatMap((category) => category.permissions)
      .reduce((acc, p) => ({ ...acc, [p.key]: p.label }), {});
  }
  return permissionLabelByKeyCache[key] || key;
};

/**
 * Permission definitions for UI rendering
 * This list is used to display checkboxes in the Create Role modal
 */
export const PERMISSION_DEFINITIONS = {
  creation: {
    label: '🔧 Creation Permissions',
    permissions: [
      { key: 'canCreateDepartment', label: 'Department creation' },
      { key: 'canCreateTask', label: 'Task creation' },
      { key: 'canCreateProject', label: 'Project creation' },
      { key: 'canCreateAnnouncement', label: 'Announcement creation' },
      { key: 'canCreateReminder', label: 'Reminder creation' }
    ]
  },
  member: {
    label: '🧑‍🤝‍🧑 Member Permissions',
    permissions: [
      { key: 'canAssignMembers', label: 'Assign members to tasks/projects/departments' }
    ]
  },
  delete: {
    label: '🗑️ Delete Permissions',
    permissions: [
      { key: 'canDeleteTasks', label: 'Delete tasks' },
      { key: 'canDeleteProjects', label: 'Delete projects' }
    ]
  },
  editing: {
    label: '✏️ Editing Permissions',
    permissions: [
      { key: 'canEditPriority', label: 'Edit task priority' },
      { key: 'canEditDates', label: 'Edit start/due dates' },
      { key: 'canManageAttachments', label: 'Manage all attachments' }
    ]
  },
  management: {
    label: '⚙️ Management Permissions',
    permissions: [
      { key: 'canManageRoles', label: 'Manage roles' },
      { key: 'canManageUsers', label: 'Manage users' },
      { key: 'canManageSystem', label: 'Full system access (Admin equivalent)' },
      { key: 'canManageAccessControl', label: 'Manage Access & Permissions module (delegated admin)' }
    ]
  }
};

// @desc    Get all roles
// @route   GET /api/roles
// @access  Private
export const getRoles = asyncHandler(async (req, res, next) => {
  const { includeInactive } = req.query;
  
  const query = includeInactive === 'true' ? {} : { isActive: true };
  
  const dbRoles = await Role.find(query)
    .populate('createdBy', 'name email')
    .sort({ isSystem: -1, name: 1 }); // System roles first, then alphabetically
    
  // Dynamically sync system roles to ensure actual permissions are always perfectly accurate
  const roles = dbRoles.map(r => {
    const roleObj = r.toObject ? r.toObject() : r;
    if (roleObj.isSystem) {
       roleObj.permissions = Role.getDefaultPermissions(roleObj.slug);
    }
    return roleObj;
  });
  
  res.status(200).json({
    success: true,
    count: roles.length,
    data: roles
  });
});

// @desc    Get single role
// @route   GET /api/roles/:id
// @access  Private
export const getRole = asyncHandler(async (req, res, next) => {
  let role = await Role.findById(req.params.id)
    .populate('createdBy', 'name email');
  
  if (!role) {
    return next(new ErrorResponse('Role not found', 404));
  }

  // Sync if system role
  if (role.isSystem) {
    const roleObj = role.toObject ? role.toObject() : role;
    roleObj.permissions = Role.getDefaultPermissions(roleObj.slug);
    role = roleObj;
  }
  
  res.status(200).json({
    success: true,
    data: role
  });
});

// @desc    Get role by slug
// @route   GET /api/roles/slug/:slug
// @access  Private
export const getRoleBySlug = asyncHandler(async (req, res, next) => {
  const role = await Role.findResolvable(req.params.slug.toLowerCase(), req.workspaceId)
    .populate('createdBy', 'name email');
  
  if (!role) {
    return next(new ErrorResponse('Role not found', 404));
  }
  
  res.status(200).json({
    success: true,
    data: role
  });
});

// @desc    Create new role
// @route   POST /api/roles
// @access  Private/Admin
export const createRole = asyncHandler(async (req, res, next) => {
  const { name, description, permissions } = req.body;
  
  // Generate slug from name
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  
  // Check if slug already exists — either as this workspace's own custom
  // role, or as a global system-role template (workspaceId: null).
  const existingRole = await Role.findOne({ slug, $or: [{ workspaceId: req.workspaceId }, { workspaceId: null }] });
  if (existingRole) {
    return next(new ErrorResponse('A role with this name already exists', 400));
  }

  // Prevent creating roles with system role names
  const systemRoleSlugs = ['admin', 'manager', 'employee', 'hr'];
  if (systemRoleSlugs.includes(slug)) {
    return next(new ErrorResponse('Cannot create role with a reserved name', 400));
  }

  const role = await Role.create({
    name,
    slug,
    description,
    permissions: permissions || {},
    isSystem: false,
    workspaceId: req.workspaceId,
    createdBy: req.user.id
  });

  res.status(201).json({
    success: true,
    data: role
  });

  const grantedKeys = Object.entries(role.permissions?.toObject?.() || role.permissions || {})
    .filter(([, v]) => v === true)
    .map(([k]) => permissionLabelByKey(k));

  recordAuditLog({
    actor: req.user,
    action: 'ROLE_CREATED',
    targetType: 'Role',
    targetId: role._id,
    resourceKey: 'role_definition',
    resourceLabel: `Role: ${role.name}`,
    summary: `${req.user.name} created role "${role.name}"${grantedKeys.length ? ` with ${grantedKeys.length} permission(s)` : ''}`,
    changeDetails: grantedKeys.map((label) => ({ label, previous: false, next: true })),
    before: null,
    after: { name: role.name, permissions: role.permissions },
    meta: { ip: req.ip, userAgent: req.headers['user-agent'] }
  }).catch(() => {});
});

// @desc    Update role
// @route   PUT /api/roles/:id
// @access  Private/Admin
export const updateRole = asyncHandler(async (req, res, next) => {
  const { name, description, permissions, isActive } = req.body;
  
  let role = await Role.findById(req.params.id);
  
  if (!role) {
    return next(new ErrorResponse('Role not found', 404));
  }
  
  // Prevent editing system roles' core properties
  if (role.isSystem) {
    return next(new ErrorResponse('System roles cannot be modified', 403));
  }
  
  // If name is changing, check for duplicate
  if (name && name !== role.name) {
    const newSlug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const existingRole = await Role.findOne({ slug: newSlug, workspaceId: role.workspaceId, _id: { $ne: role._id } });
    if (existingRole) {
      return next(new ErrorResponse('A role with this name already exists', 400));
    }
    role.name = name;
    role.slug = newSlug;
  }
  
  const beforePermissions = { ...role.permissions?.toObject?.() || role.permissions };

  if (description !== undefined) role.description = description;
  if (permissions) role.permissions = permissions;
  if (typeof isActive === 'boolean') role.isActive = isActive;

  await role.save();

  res.status(200).json({
    success: true,
    data: role
  });

  const afterPermissions = role.permissions?.toObject?.() || role.permissions || {};
  const changeDetails = [];
  new Set([...Object.keys(beforePermissions), ...Object.keys(afterPermissions)]).forEach((key) => {
    const previous = beforePermissions[key] === true;
    const next = afterPermissions[key] === true;
    if (previous !== next) {
      changeDetails.push({ label: permissionLabelByKey(key), previous, next });
    }
  });

  if (changeDetails.length > 0) {
    recordAuditLog({
      actor: req.user,
      action: 'ROLE_PERMISSIONS_UPDATED',
      targetType: 'Role',
      targetId: role._id,
      resourceKey: 'role_definition',
      resourceLabel: `Role: ${role.name}`,
      summary: `${req.user.name} updated permissions for role "${role.name}"`,
      changeDetails,
      before: { name: role.name, permissions: beforePermissions },
      after: { name: role.name, permissions: afterPermissions },
      meta: { ip: req.ip, userAgent: req.headers['user-agent'] }
    }).catch(() => {});
  }
});

// @desc    Delete role
// @route   DELETE /api/roles/:id
// @access  Private/Admin
export const deleteRole = asyncHandler(async (req, res, next) => {
  const role = await Role.findById(req.params.id);
  
  if (!role) {
    return next(new ErrorResponse('Role not found', 404));
  }
  
  // Prevent deleting system roles
  if (role.isSystem) {
    return next(new ErrorResponse('System roles cannot be deleted', 403));
  }
  
  // Check if any users have this role
  const usersWithRole = await User.countDocuments({ role: role.slug });
  if (usersWithRole > 0) {
    return next(new ErrorResponse(`Cannot delete role. ${usersWithRole} user(s) are assigned to this role. Please reassign them first.`, 400));
  }
  
  await role.deleteOne();

  res.status(200).json({
    success: true,
    data: {}
  });

  recordAuditLog({
    actor: req.user,
    action: 'ROLE_DELETED',
    targetType: 'Role',
    targetId: role._id,
    resourceKey: 'role_definition',
    resourceLabel: `Role: ${role.name}`,
    summary: `${req.user.name} deleted role "${role.name}"`,
    changeDetails: [{ label: 'Role', previous: role.name, next: 'Deleted' }],
    before: { name: role.name, permissions: role.permissions },
    after: null,
    meta: { ip: req.ip, userAgent: req.headers['user-agent'] }
  }).catch(() => {});
});

// @desc    Get permission definitions (for UI)
// @route   GET /api/roles/permissions/definitions
// @access  Private/Admin
export const getPermissionDefinitions = asyncHandler(async (req, res, next) => {
  res.status(200).json({
    success: true,
    data: PERMISSION_DEFINITIONS
  });
});

// @desc    Get user's permissions based on their role
// @route   GET /api/roles/my-permissions
// @access  Private
export const getMyPermissions = asyncHandler(async (req, res, next) => {
  const userRole = req.user.role.toLowerCase();

  // Find the role in database
  let role = await Role.findResolvable(userRole, req.workspaceId);
  
  // If role doesn't exist in DB (legacy data), use default permissions
  if (!role) {
    const defaultPermissions = Role.getDefaultPermissions(userRole);
    return res.status(200).json({
      success: true,
      data: {
        role: userRole,
        permissions: defaultPermissions,
        isSystem: ['admin', 'manager', 'employee', 'hr'].includes(userRole)
      }
    });
  }
  
  res.status(200).json({
    success: true,
    data: {
      role: role.slug,
      roleName: role.name,
      permissions: role.isSystem ? Role.getDefaultPermissions(role.slug) : role.permissions,
      isSystem: role.isSystem
    }
  });
});

// @desc    Initialize/seed default roles
// @route   POST /api/roles/init
// @access  Private/Admin
export const initializeRoles = asyncHandler(async (req, res, next) => {
  const systemRoles = [
    {
      name: 'Admin',
      slug: 'admin',
      description: 'Full system access with all permissions',
      permissions: Role.getDefaultPermissions('admin'),
      isSystem: true
    },
    {
      name: 'Manager',
      slug: 'manager',
      description: 'Can manage projects, tasks, and team members',
      permissions: Role.getDefaultPermissions('manager'),
      isSystem: true
    },
    {
      name: 'HR',
      slug: 'hr',
      description: 'Human resources with department and announcement access',
      permissions: Role.getDefaultPermissions('hr'),
      isSystem: true
    },
    {
      name: 'Employee',
      slug: 'employee',
      description: 'Standard employee with basic task access',
      permissions: Role.getDefaultPermissions('employee'),
      isSystem: true
    }
  ];
  
  const results = [];
  
  for (const roleData of systemRoles) {
    const existingRole = await Role.findOne({ slug: roleData.slug, workspaceId: null });
    if (!existingRole) {
      const role = await Role.create(roleData);
      results.push({ role: roleData.name, status: 'created' });
    } else {
      existingRole.permissions = roleData.permissions;
      await existingRole.save();
      results.push({ role: roleData.name, status: 'updated' });
    }
  }
  
  res.status(200).json({
    success: true,
    message: 'Roles initialized',
    data: results
  });
});
