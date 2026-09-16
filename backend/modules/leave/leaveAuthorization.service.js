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
