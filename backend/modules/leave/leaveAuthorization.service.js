import Department from '../../models/Department.js';
import mongoose from 'mongoose';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import LeaveRequest from './leaveRequest.model.js';
import { departmentRosterFieldForRole } from '../workspaces/departmentRosterSync.js';
import { resolveResourceAccess } from '../permissions/permissionEngine.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';

/**
 * Admin is a deliberate exception to Leave's "everyone gets self-service"
 * rule: every OTHER role (Employee, Manager, HR, custom) keeps full
 * personal My Leave access unconditionally (see leaveRequest.routes.js's
 * own comment on why self-service is structural, not permission-gated),
 * but an Admin administers the module (Dashboard/Approvals/Calendar/
 * Reports/Settings) and does not participate in it personally. This is
 * intentionally narrower than — and independent of — canViewUserLeaveData's
 * "Admin can view anyone" rule below, which keeps governing every OTHER-user
 * visibility case (Teams day-status overlay, approval queue, dashboards,
 * viewing an employee's balance/history) unchanged. Only a My-Leave call
 * site acting on/viewing the CALLER's own data needs this check.
 */
export function isMyLeaveSelfServiceBlocked(user) {
  return String(user?.role || '').toLowerCase() === 'admin';
}

/** Throws the shared friendly 403 for every self-service call site an Admin should never reach. */
export function assertMyLeaveSelfServiceAllowed(user) {
  if (isMyLeaveSelfServiceBlocked(user)) {
    throw new ErrorResponse(
      'The "My Leave" self-service area is not available for the Admin role. Use the Leave Dashboard or Reports instead.',
      403
    );
  }
}

/**
 * Visibility rule shared by the balance/dashboard/report controllers —
 * Employee sees only self; Manager sees self + genuinely-managed
 * departments' current employees (derived from current workspace relationships,
 * never trusted from a frontend-supplied department id); HR/Admin see
 * workspace-wide per the `leave.view_workspace` administrative permission
 * (Admin always has it, per permissionEngine's own Admin-full-access rule).
 */
export async function canViewUserLeaveData({ viewer, targetUserId, workspaceId }) {
  const scope = await resolveLeaveAccessScope({ viewer, workspaceId, includeEmployees: true });
  return canViewUserInLeaveScope(scope, targetUserId);
}
export function canViewUserInLeaveScope(scope, targetUserId) {
  return String(scope.viewer._id) === String(targetUserId) || scope.scope === 'workspace' || scope.employeeIds.some((id) => String(id) === String(targetUserId));
}

export async function resolveCurrentManagedDepartments({ workspaceId, managerId, membership, session = null, includeEmployees = true }) {
  const member = membership || await WorkspaceMembership.findOne({ workspace: workspaceId, user: managerId, status: 'active' }).session(session).lean();
  if (!member) return { departmentIds: [], employeeIds: [] };
  const relationships = [{ managers: managerId }];
  // Membership assignments use the same existing roster convention as the
  // assignment writer. This also handles pre-fix membership-only assignments.
  if (departmentRosterFieldForRole(member.role) === 'managers') relationships.push({ _id: { $in: member.department || [] } });
  const departments = await Department.find({ workspaceId, isActive: true, $or: relationships }).session(session).select(includeEmployees ? '_id members' : '_id').lean();
  const departmentIds = departments.map((department) => department._id);
  const employeeIds = includeEmployees && departmentIds.length ? await WorkspaceMembership.find({ workspace: workspaceId, status: 'active', $or: [{ department: { $in: departmentIds } }, { user: { $in: departments.flatMap((department) => department.members || []) } }] }).session(session).distinct('user') : [];
  return { departmentIds, employeeIds };
}

export async function getManagedDepartmentIds(options) {
  return (await resolveCurrentManagedDepartments({ ...options, includeEmployees: false })).departmentIds;
}
export async function getManagedEmployeeIds({ workspaceId, managerId }) {
  return (await resolveCurrentManagedDepartments({ workspaceId, managerId })).employeeIds;
}

// Request visibility follows the immutable submission department association,
// not the requester's present department or the manager's assignment date.
export async function resolveLeaveAccessScope({ viewer, workspaceId, includeEmployees = false, session = null }) {
  const userId = viewer._id || viewer.id;
  const membership = await WorkspaceMembership.findOne({ workspace: workspaceId, user: userId, status: 'active' }).session(session).select('role roleId department user').lean();
  if (!membership) throw new ErrorResponse('Active workspace membership is required', 403);
  const principal = { ...viewer, _id: userId, id: String(userId), role: membership.role, roleId: membership.roleId, department: membership.department };
  const [access, managed] = await Promise.all([
    resolveResourceAccess(principal, 'leave', workspaceId),
    resolveCurrentManagedDepartments({ workspaceId, managerId: userId, membership, includeEmployees, session })
  ]);
  const workspace = new mongoose.Types.ObjectId(workspaceId), user = new mongoose.Types.ObjectId(userId);
  if (access.actions.view_workspace && access.scope === 'full') return { viewer: principal, access, scope: 'workspace', ...managed, requestFilter: { workspaceId: workspace } };
  return { viewer: principal, access, scope: managed.departmentIds.length ? 'department' : 'none', ...managed,
    requestFilter: { workspaceId: workspace, ...(managed.departmentIds.length ? { $or: [{ requester: user }, { requesterDepartmentIds: { $in: managed.departmentIds } }] } : { requester: user }) } };
}

export async function canViewLeaveRequest({ viewer, workspaceId, requestId }) {
  const { requestFilter } = await resolveLeaveAccessScope({ viewer, workspaceId });
  return Boolean(await LeaveRequest.exists({ $and: [requestFilter, { _id: requestId }] }));
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
 * - 'none': members with neither grant still have their personal Dashboard.
 */
export async function getLeaveDashboardScope({ user, workspaceId }) {
  const { scope, departmentIds } = await resolveLeaveAccessScope({ viewer: user, workspaceId });
  return { scope, departmentIds };
}
