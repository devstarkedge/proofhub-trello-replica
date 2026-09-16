import Department from '../../models/Department.js';
import { hasResourceAction } from '../permissions/permissionEngine.js';

/**
 * Visibility rule shared by the balance/dashboard/report controllers —
 * Employee sees only self; Manager sees self + genuinely-managed
 * departments' employees (derived server-side from Department.managers,
 * never trusted from a frontend-supplied department id); HR/Admin see
 * workspace-wide per the `leave.view_workspace` administrative permission
 * (Admin always has it, per permissionEngine's own Admin-full-access rule).
 */
export async function canViewUserLeaveData({ viewer, targetUserId, workspaceId }) {
  const viewerId = viewer._id || viewer.id;
  if (String(viewerId) === String(targetUserId)) return true;
  if (viewer.role === 'admin') return true;

  if (viewer.role === 'hr' && await hasResourceAction(viewer, 'leave', 'view_workspace', workspaceId)) {
    return true;
  }

  if (viewer.role === 'manager') {
    const managed = await Department.findOne({
      workspaceId, managers: viewerId, members: targetUserId, isActive: true
    }).select('_id').lean();
    if (managed) return true;
  }

  return false;
}

export async function getManagedDepartmentIds({ workspaceId, managerId }) {
  const departments = await Department.find({ workspaceId, managers: managerId, isActive: true }).select('_id').lean();
  return departments.map((department) => department._id);
}

export async function getManagedEmployeeIds({ workspaceId, managerId }) {
  const departments = await Department.find({ workspaceId, managers: managerId, isActive: true }).select('members').lean();
  return Array.from(new Set(departments.flatMap((department) => (department.members || []).map(String))));
}

/**
 * Single source of truth for "what Leave Dashboard scope, if any, does this
 * user get" — reused both to gate the manager/workspace dashboard routes
 * and by GET /dashboard/scope, which the frontend must consult instead of
 * branching on the raw `user.role` string. A custom role's real
 * entitlement can only be known server-side: Department.managers/members
 * are plain User references with no role restriction, so a custom-role
 * user assigned as a department manager is picked up here exactly like a
 * literal "manager"-role user would be, and one merely granted the
 * `leave.view_workspace` permission gets the same workspace-wide scope HR
 * gets — no separate custom-role code path needed.
 *
 * - 'workspace': Admin always; HR always (permissionEngine.js grants HR
 *   full 'leave' access by default — no override needed); any other
 *   (custom) role only if explicitly granted leave.view_workspace.
 * - 'department': anyone who genuinely manages at least one Department
 *   (Department.managers membership), scoped to exactly those departments.
 * - 'none': plain Employees and any custom role with neither of the
 *   above — they keep their own personal leave data (My Leave) but never
 *   a team/workspace dashboard.
 */
export async function getLeaveDashboardScope({ user, workspaceId }) {
  const userId = user._id || user.id;

  if (user.role === 'admin' || await hasResourceAction(user, 'leave', 'view_workspace', workspaceId)) {
    return { scope: 'workspace', departmentIds: [] };
  }

  const departmentIds = await getManagedDepartmentIds({ workspaceId, managerId: userId });
  if (departmentIds.length > 0) {
    return { scope: 'department', departmentIds };
  }

  return { scope: 'none', departmentIds: [] };
}
