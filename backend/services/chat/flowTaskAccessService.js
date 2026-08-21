import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import {
  CAPABILITIES,
  userHasCapability,
} from '../permissionService.js';

function ids(values) {
  return (Array.isArray(values) ? values : values ? [values] : [])
    .map((value) => (value?._id || value?.id || value)?.toString())
    .filter(Boolean);
}

/**
 * A deliberately small, signed representation of the *active* FlowTask
 * workspace authorization. ChatApp persists this on its corresponding
 * WorkspaceMembership; it must never infer it from the globally shared User
 * document because a person can have different roles in different workspaces.
 */
export function buildFlowTaskAccessSnapshot(user) {
  const role = (user?.role || 'employee').toLowerCase();
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
    syncedAt: new Date().toISOString(),
  };
}

export async function resolveFlowTaskAccessSnapshot(userId, workspaceId, fallbackUser = null) {
  if (!workspaceId) return buildFlowTaskAccessSnapshot(fallbackUser);

  const membership = await WorkspaceMembership.findOne({
    user: userId,
    workspace: workspaceId,
    status: 'active',
  }).lean();

  if (!membership) return buildFlowTaskAccessSnapshot(fallbackUser);

  return buildFlowTaskAccessSnapshot({
    ...(fallbackUser || {}),
    role: membership.role,
    roleId: membership.roleId,
    department: membership.department,
    team: membership.team,
    accessType: membership.accessType,
    allowedProjects: membership.allowedProjects,
  });
}

export default {
  buildFlowTaskAccessSnapshot,
  resolveFlowTaskAccessSnapshot,
};
