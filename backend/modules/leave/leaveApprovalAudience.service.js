import Department from '../../models/Department.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import Workspace from '../../models/Workspace.js';

/**
 * Shared "who is eligible to act on this" resolvers — used by the approval-
 * chain generator (leaveApproval.service.js), by notification fan-out
 * (leaveHooks.js), and by manager/HR dashboards, so there is exactly one
 * implementation of each rule rather than three drifting copies.
 */

async function activeMembershipIds(userIds, workspaceId) {
  if (!userIds.length) return [];
  const rows = await WorkspaceMembership.find({
    workspace: workspaceId, user: { $in: userIds }, status: 'active'
  }).select('user').lean();
  return rows.map((row) => row.user);
}

/** Union of Department.managers across every department the user belongs to, excluding the user. */
export async function resolveDepartmentManagers({ workspaceId, departmentIds, excludeUserId }) {
  const ids = (departmentIds || []).filter(Boolean);
  if (!ids.length) return [];

  const departments = await Department.find({ workspaceId, _id: { $in: ids }, isActive: true })
    .select('managers')
    .lean();
  const managerIds = Array.from(new Set(
    departments.flatMap((department) => (department.managers || []).map(String))
  )).filter((id) => id !== String(excludeUserId));

  return activeMembershipIds(managerIds, workspaceId);
}

/** Every active member holding `role`, excluding the given user. */
export async function resolveActiveMembersByRole({ workspaceId, role, excludeUserId }) {
  const rows = await WorkspaceMembership.find({
    workspace: workspaceId, role, status: 'active', user: { $ne: excludeUserId }
  }).select('user').lean();
  return rows.map((row) => row.user);
}

/**
 * Admin approver resolution with the full fallback chain: other active
 * Admins -> workflow.adminFallbackApproverUserId -> Workspace.owner ->
 * genuinely nobody (caller must handle this by setting
 * LeaveRequest.blockedReason, never by auto-approving).
 */
export async function resolveAdminApprovers({ workspaceId, excludeUserId, workflow }) {
  const admins = await resolveActiveMembersByRole({ workspaceId, role: 'admin', excludeUserId });
  if (admins.length > 0) return admins;

  const fallbackId = workflow?.adminFallbackApproverUserId;
  if (fallbackId && String(fallbackId) !== String(excludeUserId)) {
    const [fallback] = await activeMembershipIds([fallbackId], workspaceId);
    if (fallback) return [fallback];
  }

  const workspace = await Workspace.findById(workspaceId).select('owner').lean();
  if (workspace?.owner && String(workspace.owner) !== String(excludeUserId)) {
    const [owner] = await activeMembershipIds([workspace.owner], workspaceId);
    if (owner) return [owner];
  }

  return [];
}
