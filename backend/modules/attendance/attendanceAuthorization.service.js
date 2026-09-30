import { hasResourceAction } from '../permissions/permissionEngine.js';
import { getManagedDepartmentIds, getManagedEmployeeIds } from '../organization/departmentScopeFacade.js';
import { resolveDepartmentManagers, resolveActiveMembersByRole } from '../leave/leaveApprovalAudience.service.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';

/**
 * The single centralized Attendance visibility resolver (new spec §7,
 * §24) — every controller that needs "what can this viewer see" goes
 * through resolveAttendanceAccess, never re-derives scope itself. Mirrors
 * leaveAuthorization.service.js#getLeaveDashboardScope/canViewUserLeaveData
 * exactly: same precedence, same Department.managers-derived scoping,
 * same refusal to trust a frontend-supplied departmentId or the viewer's
 * OWN `membership.department` array (that's "departments I belong to,"
 * never "departments I manage" — conflating the two is exactly the bug
 * teamAnalyticsController.js has today, not one to repeat here).
 *
 * Three possible scopes, in precedence order:
 *   'workspace'  — Admin always; anyone else via the generic permission
 *                  engine's attendance.view_workspace action (HR already
 *                  gets this via RESOURCE_ROLE_DEFAULTS.attendance.hr, no
 *                  override needed; a Custom Role only if explicitly
 *                  granted — never hardcoded here).
 *   'department' — genuinely manages at least one Department
 *                  (Department.managers membership), scoped to exactly
 *                  those departments' members, regardless of the viewer's
 *                  own role STRING (a custom-role "team_lead" who is a
 *                  real department manager gets identical treatment).
 *   'self'       — the universal floor: every attendance-eligible member
 *                  can always see their own attendance, matching Leave's
 *                  own self-service precedent (never permission-gated).
 */
export async function resolveAttendanceAccess({ viewer, workspaceId }) {
  const viewerId = viewer._id || viewer.id;

  const [
    canViewWorkspace, canManagePolicy, canManageShifts, canManageLocations, canManageWorkModes,
    canApproveWfh, canApproveRegularization, canCorrect, canViewReports, canViewAudit
  ] = await Promise.all([
    viewer.role === 'admin' ? true : hasResourceAction(viewer, 'attendance', 'view_workspace', workspaceId),
    hasResourceAction(viewer, 'attendance', 'manage_policy', workspaceId),
    hasResourceAction(viewer, 'attendance', 'manage_shifts', workspaceId),
    hasResourceAction(viewer, 'attendance', 'manage_locations', workspaceId),
    hasResourceAction(viewer, 'attendance', 'manage_work_modes', workspaceId),
    hasResourceAction(viewer, 'attendance', 'approve_wfh', workspaceId),
    hasResourceAction(viewer, 'attendance', 'approve_regularization', workspaceId),
    hasResourceAction(viewer, 'attendance', 'correct_attendance', workspaceId),
    hasResourceAction(viewer, 'attendance', 'view_reports', workspaceId),
    hasResourceAction(viewer, 'attendance', 'view_audit', workspaceId)
  ]);

  const managementPermissions = { canManagePolicy, canManageShifts, canManageLocations, canManageWorkModes };
  const correctionPermissions = { canApproveWfh, canApproveRegularization, canCorrect };
  const reportPermissions = { canViewReports, canViewAudit };

  if (canViewWorkspace) {
    return {
      scope: 'workspace', canViewSelf: true, canViewDepartment: true, canViewWorkspace: true,
      allowedDepartmentIds: [], allowedUserIds: null, // null = unrestricted (workspace-wide)
      managementPermissions, correctionPermissions, reportPermissions
    };
  }

  const allowedDepartmentIds = await getManagedDepartmentIds({ workspaceId, managerId: viewerId });
  if (allowedDepartmentIds.length > 0) {
    const managedEmployeeIds = await getManagedEmployeeIds({ workspaceId, managerId: viewerId });
    const allowedUserIds = Array.from(new Set([...managedEmployeeIds, String(viewerId)]));
    return {
      scope: 'department', canViewSelf: true, canViewDepartment: true, canViewWorkspace: false,
      allowedDepartmentIds, allowedUserIds,
      managementPermissions, correctionPermissions, reportPermissions
    };
  }

  return {
    scope: 'self', canViewSelf: true, canViewDepartment: false, canViewWorkspace: false,
    allowedDepartmentIds: [], allowedUserIds: [String(viewerId)],
    managementPermissions, correctionPermissions, reportPermissions
  };
}

/**
 * Per-record check: can `viewer` see `targetUserId`'s attendance? The one
 * true gate every "view a specific employee's record" call site must use
 * — mirrors canViewUserLeaveData exactly. Never trust a frontend claim
 * that a user is "in view" — always resolve this server-side.
 */
export async function canViewUserAttendance({ viewer, targetUserId, workspaceId }) {
  const viewerId = viewer._id || viewer.id;
  if (String(viewerId) === String(targetUserId)) return true;

  const access = await resolveAttendanceAccess({ viewer, workspaceId });
  if (access.scope === 'workspace') return true;
  return access.allowedUserIds?.some((id) => String(id) === String(targetUserId)) || false;
}

/**
 * Throws a 403 (never a silently-empty result — spec §8 is explicit that
 * hiding an authorization violation behind an empty list is itself a
 * security bug) when the viewer requests a specific department they don't
 * actually manage and isn't workspace-scoped.
 */
export function assertCanViewDepartment(access, departmentId) {
  if (access.scope === 'workspace') return;
  if (access.scope === 'department' && access.allowedDepartmentIds.some((id) => String(id) === String(departmentId))) return;
  throw new ErrorResponse('Not authorized to view this department\'s attendance', 403);
}

/** Same fail-loud-not-empty contract as assertCanViewDepartment, for a specific requested employee. */
export function assertCanViewUser(access, viewerId, targetUserId) {
  if (access.scope === 'workspace') return;
  if (String(viewerId) === String(targetUserId)) return;
  if (access.allowedUserIds?.some((id) => String(id) === String(targetUserId))) return;
  throw new ErrorResponse('Not authorized to view this employee\'s attendance', 403);
}

/**
 * Who — besides the subject themselves — is authorized to receive a
 * realtime check-in/check-out nudge for this specific employee (spec §20):
 * the department manager(s) of whichever department(s) the subject
 * actually belongs to (`membership.department` used correctly here as
 * "departments this employee is a member of," the opposite of the
 * misuse this resolver's own doc-comment warns against elsewhere), plus
 * every active Admin/HR member workspace-wide (same audience
 * `resolveAttendanceAccess` grants 'workspace' scope to). Callers must
 * still use only personal-room emitToUser/emitToUsers with this list —
 * never a shared department/workspace room — exactly like every other
 * fan-out in attendanceHooks.js.
 */
export async function resolveAttendanceObserverUserIds({ workspaceId, subjectUserId, subjectDepartmentIds }) {
  const [managerIds, adminIds, hrIds] = await Promise.all([
    resolveDepartmentManagers({ workspaceId, departmentIds: subjectDepartmentIds, excludeUserId: subjectUserId }),
    resolveActiveMembersByRole({ workspaceId, role: 'admin', excludeUserId: subjectUserId }),
    resolveActiveMembersByRole({ workspaceId, role: 'hr', excludeUserId: subjectUserId })
  ]);
  return Array.from(new Set([...managerIds, ...adminIds, ...hrIds].map(String)));
}
