import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import Role from '../../models/Role.js';
import {
  CAPABILITIES,
  userHasCapability,
} from '../permissionService.js';

function ids(values) {
  return (Array.isArray(values) ? values : values ? [values] : [])
    .map((value) => (value?._id || value?.id || value)?.toString())
    .filter(Boolean);
}

const ROLE_PERMISSION_KEYS = Object.freeze([
  'canCreateDepartment', 'canCreateTask', 'canCreateProject',
  'canCreateAnnouncement', 'canCreateReminder', 'canAssignMembers',
  'canInviteMembers', 'canApproveJoinRequests', 'canDeleteTasks',
  'canDeleteProjects', 'canEditPriority', 'canEditDates',
  'canManageAttachments', 'canManageRoles', 'canManageUsers',
  'canManageSystem', 'canManageAccessControl',
]);
const SYSTEM_ROLE_SLUGS = new Set(['admin', 'manager', 'hr', 'employee']);

function normalizeRolePermissions(permissions) {
  if (!permissions || typeof permissions !== 'object') return null;
  const snapshot = {};
  for (const key of ROLE_PERMISSION_KEYS) {
    if (typeof permissions[key] === 'boolean') snapshot[key] = permissions[key];
  }
  return Object.keys(snapshot).length ? snapshot : null;
}

async function resolveRolePermissions({ role, roleId, workspaceId }) {
  let roleDocument = null;
  if (roleId) {
    roleDocument = await Role.findOne({ _id: roleId, isActive: true })
      .select('workspaceId permissions')
      .lean();
    // A custom role from another workspace is never valid for this snapshot.
    if (roleDocument?.workspaceId && roleDocument.workspaceId.toString() !== workspaceId?.toString()) {
      roleDocument = null;
    }
  } else if (role) {
    roleDocument = await Role.findResolvable(role, workspaceId)
      .select('permissions')
      .lean();
  }

  return normalizeRolePermissions(roleDocument?.permissions)
    || (SYSTEM_ROLE_SLUGS.has(role)
      ? normalizeRolePermissions(Role.getDefaultPermissions(role))
      : null);
}

/**
 * A deliberately small, signed representation of the *active* FlowTask
 * workspace authorization. ChatApp persists this on its corresponding
 * WorkspaceMembership; it must never infer it from the globally shared User
 * document because a person can have different roles in different workspaces.
 */
export function buildFlowTaskAccessSnapshot(user, rolePermissions = null) {
  const role = typeof user?.role === 'string' ? user.role.toLowerCase() : null;
  const accessType = user?.accessType || 'assigned_tasks';

  return {
    role,
    roleId: (user?.roleId?._id || user?.roleId || null)?.toString() || null,
    departmentIds: ids(user?.department),
    teamId: (user?.team?._id || user?.team || null)?.toString() || null,
    accessType,
    allowedProjectIds: ids(user?.allowedProjects),
    canViewAllProjects: userHasCapability(user, CAPABILITIES.VIEW_ALL_PROJECTS),
    canViewDepartmentProjects:
      !userHasCapability(user, CAPABILITIES.FORCE_ASSIGNMENT_SCOPE)
      && accessType === 'full_department',
    canViewSelectedProjects:
      !userHasCapability(user, CAPABILITIES.FORCE_ASSIGNMENT_SCOPE)
      && accessType === 'selected_projects',
    // This mirrors FlowTask's existing getBoards rule: public projects are
    // additive for managers, never an implicit employee-wide grant.
    canViewPublicProjects: role === 'manager',
    rolePermissions: normalizeRolePermissions(rolePermissions),
    syncedAt: new Date().toISOString(),
  };
}

export async function resolveFlowTaskAccessSnapshot(userId, workspaceId, fallbackUser = null) {
  if (!workspaceId) {
    const role = typeof fallbackUser?.role === 'string' ? fallbackUser.role.toLowerCase() : null;
    return buildFlowTaskAccessSnapshot(fallbackUser, await resolveRolePermissions({
      role,
      roleId: fallbackUser?.roleId,
      workspaceId: null,
    }));
  }

  const membership = await WorkspaceMembership.findOne({
    user: userId,
    workspace: workspaceId,
    status: 'active',
  }).lean();

  if (!membership) return buildFlowTaskAccessSnapshot(fallbackUser);

  const accessUser = {
    ...(fallbackUser || {}),
    role: membership.role,
    roleId: membership.roleId,
    department: membership.department,
    team: membership.team,
    accessType: membership.accessType,
    allowedProjects: membership.allowedProjects,
  };
  return buildFlowTaskAccessSnapshot(accessUser, await resolveRolePermissions({
    role: accessUser.role,
    roleId: accessUser.roleId,
    workspaceId,
  }));
}

export default {
  buildFlowTaskAccessSnapshot,
  resolveFlowTaskAccessSnapshot,
};
