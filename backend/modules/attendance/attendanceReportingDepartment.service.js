import Department from '../../models/Department.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import logger from '../../utils/logger.js';

export const assignedDepartmentIds = member => (member?.departments ?? member?.department ?? []).map(String);

export function primaryReportingDepartmentId(member, activeIds) {
  const configured = member?.attendanceReportingDepartmentId;
  if (configured) return activeIds.has(String(configured)) ? String(configured) : null;
  return assignedDepartmentIds(member).find(id => activeIds.has(id)) ?? null;
}

export function reportingMembership(workspaceId, userId, dbSession) {
  return WorkspaceMembership.findOne({ workspace: workspaceId, user: userId, status: 'active' })
    .select('department departments attendanceReportingDepartmentId').session(dbSession).lean();
}

export function activeReportingDepartments(workspaceId, ids, dbSession = null) {
  if (!ids.length) return Promise.resolve([]);
  return Department.find({ workspaceId, _id: { $in: ids }, isActive: true })
    .select('_id name').session(dbSession).lean();
}

export async function captureReportingDepartment({ workspaceId, userId, dbSession }) {
  const member = await reportingMembership(workspaceId, userId, dbSession);
  const configured = member?.attendanceReportingDepartmentId;
  const assignments = assignedDepartmentIds(member);
  const candidates = configured ? assignments.filter(id => id === String(configured)) : assignments;
  const active = await activeReportingDepartments(workspaceId, candidates, dbSession);
  const id = primaryReportingDepartmentId(member, new Set(active.map(row => String(row._id))));
  if (!id) {
    if (configured) logger.warn('Configured attendance reporting department is unavailable', {
      workspaceId: String(workspaceId), departmentId: String(configured),
    });
    return null;
  }
  if (!configured) {
    // The transaction retries if an administrator edits this member while the
    // default is being materialized. Subsequent sessions use the saved choice.
    await WorkspaceMembership.updateOne({ _id: member._id, workspace: workspaceId, status: 'active',
      attendanceReportingDepartmentId: null }, { $set: { attendanceReportingDepartmentId: id } }, { session: dbSession });
  }
  return active.find(row => String(row._id) === id);
}
