import AttendanceDay from './attendanceDay.model.js';
import AttendanceSession from './attendanceSession.model.js';
import Department from '../../models/Department.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import {
  resolveAttendanceAccess,
  assertCanViewDepartment,
  assertCanViewUser,
  canViewUserAttendance
} from './attendanceAuthorization.service.js';

/**
 * The single centralized Attendance data-query layer (new spec §9-14) —
 * every "list/summarize attendance" call site goes through
 * getAttendanceView/getAttendanceDashboardSummary, never queries
 * AttendanceDay directly with an ad hoc role check. Authorization is
 * resolved via attendanceAuthorization.service.js and enforced BEFORE any
 * query runs; an unauthorized specific userId/departmentId throws (spec
 * §8) rather than silently narrowing to an empty/self-only result.
 */

/** Department members, independent of who manages it — a workspace-scoped viewer (Admin/HR) may legitimately ask for ANY department's roster, not just one they personally manage. */
async function resolveDepartmentMemberIds({ workspaceId, departmentId }) {
  const department = await Department.findOne({ _id: departmentId, workspaceId, isActive: true }).select('members').lean();
  if (!department) throw new ErrorResponse('Department not found', 404);
  return (department.members || []).map(String);
}

/**
 * Resolves the effective `user` filter for an AttendanceDay query given the
 * viewer's access and the requested userId/departmentId, enforcing
 * authorization first. Returns `null` for "no filter" (workspace-wide) or
 * an array of user-id strings (possibly empty, meaning "no visible users"
 * — e.g. a manager who manages departments but the requested filter
 * legitimately resolves to nobody).
 */
async function resolveUserIdFilter({ access, viewerId, workspaceId, userId, departmentId }) {
  if (userId) {
    assertCanViewUser(access, viewerId, userId);
    return [String(userId)];
  }
  if (departmentId) {
    assertCanViewDepartment(access, departmentId);
    return resolveDepartmentMemberIds({ workspaceId, departmentId });
  }
  return access.scope === 'workspace' ? null : access.allowedUserIds;
}

function buildDayFilter({ workspaceId, userIdFilter, startDate, endDate, status, workMode }) {
  const filter = { workspaceId };
  if (userIdFilter) filter.user = { $in: userIdFilter };
  if (startDate || endDate) {
    filter.workDateKey = {};
    if (startDate) filter.workDateKey.$gte = startDate;
    if (endDate) filter.workDateKey.$lte = endDate;
  }
  if (status) filter.presenceState = status;
  if (workMode) filter.workMode = workMode;
  return filter;
}

/**
 * `viewer` = req.user (already carries the active-workspace membership's
 * role/department overlay, see authMiddleware.js). Returns
 * `{ scope, records }`; `records` is `[]` when the resolved filter is a
 * genuinely empty user set (e.g. a manager managing a department with zero
 * members) — that is a valid empty result, distinct from an unauthorized
 * request, which throws instead (never conflate the two).
 */
export async function getAttendanceView({ viewer, workspaceId, startDate, endDate, userId = null, departmentId = null, status = null, workMode = null }) {
  const viewerId = viewer._id || viewer.id;
  const access = await resolveAttendanceAccess({ viewer, workspaceId });
  const userIdFilter = await resolveUserIdFilter({ access, viewerId, workspaceId, userId, departmentId });

  if (Array.isArray(userIdFilter) && userIdFilter.length === 0) {
    return { scope: access.scope, records: [] };
  }

  const filter = buildDayFilter({ workspaceId, userIdFilter, startDate, endDate, status, workMode });
  const records = await AttendanceDay.find(filter)
    .sort({ workDateKey: -1 })
    .populate('user', 'name email avatar')
    .lean();

  return { scope: access.scope, records };
}

const SUMMARY_STATES = ['NOT_STARTED', 'PRESENT', 'HALF_PRESENT', 'ABSENT', 'MISSING_CHECKOUT'];

/**
 * Dashboard summary counts (spec §10-12), scoped identically to
 * getAttendanceView. Admin/non-attendance-subjects never have AttendanceDay
 * rows at all (see attendanceEligibility.service.js's ADMIN_EXCLUDED path),
 * so they're structurally excluded from every count below with no extra
 * filter needed.
 */
export async function getAttendanceDashboardSummary({ viewer, workspaceId, startDate, endDate, departmentId = null }) {
  const viewerId = viewer._id || viewer.id;
  const access = await resolveAttendanceAccess({ viewer, workspaceId });
  const userIdFilter = await resolveUserIdFilter({ access, viewerId, workspaceId, userId: null, departmentId });

  const counts = SUMMARY_STATES.reduce((acc, state) => ({ ...acc, [state]: 0 }), {});
  if (Array.isArray(userIdFilter) && userIdFilter.length === 0) {
    return { scope: access.scope, totalMembers: 0, counts };
  }

  const filter = buildDayFilter({ workspaceId, userIdFilter, startDate, endDate });
  const rows = await AttendanceDay.aggregate([
    { $match: filter },
    { $group: { _id: '$presenceState', count: { $sum: 1 } } }
  ]);
  rows.forEach((row) => {
    if (row._id in counts) counts[row._id] = row.count;
  });

  const totalMembers = userIdFilter ? userIdFilter.length : await AttendanceDay.distinct('user', filter).then((ids) => ids.length);
  return { scope: access.scope, totalMembers, counts };
}

/** Precise GPS/location fields (spec §15) — stripped from any evidence bundle unless the viewer is the session's own subject or holds attendance.view_audit. */
function redactEvidence(evidence) {
  if (!evidence) return null;
  const { coordinates, reportedAccuracyMeters, ipAddress, capturedAt, ...rest } = evidence;
  return rest;
}

/**
 * A single session's full evidence, for an authorized "detail view" only —
 * never returned as part of a list. Redacts precise GPS/location fields for
 * any viewer who is neither the session's own subject nor holding
 * attendance.view_audit, per spec §15's explicit restriction.
 */
export async function getAttendanceSessionDetail({ viewer, workspaceId, sessionId }) {
  const viewerId = viewer._id || viewer.id;
  const session = await AttendanceSession.findOne({ _id: sessionId, workspaceId }).lean();
  if (!session) throw new ErrorResponse('Attendance session not found', 404);

  const targetUserId = session.user;
  const authorized = await canViewUserAttendance({ viewer, targetUserId, workspaceId });
  if (!authorized) throw new ErrorResponse('Not authorized to view this attendance record', 403);

  const isSelf = String(viewerId) === String(targetUserId);
  if (isSelf) return session;

  const access = await resolveAttendanceAccess({ viewer, workspaceId });
  if (access.reportPermissions?.canViewAudit) return session;

  return { ...session, checkIn: redactEvidence(session.checkIn), checkOut: redactEvidence(session.checkOut) };
}
