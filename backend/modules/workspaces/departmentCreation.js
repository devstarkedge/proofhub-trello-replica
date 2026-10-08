import Department from '../../models/Department.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { syncMembershipFromUser } from './membershipSyncService.js';

/**
 * Shared DB-write core for department creation. Extracted from
 * departmentController.createDepartment so the same logic can run either as
 * a standalone write (existing POST /api/departments endpoint, relying on
 * the ambient per-request workspace context set by `protect`) or inside a
 * multi-document transaction (workspaceController.createWorkspace, which
 * passes `session` so this participates in that transaction instead of
 * being a second, non-atomic write).
 *
 * Does not itself establish workspace context — the caller must already be
 * inside workspaceContext.run()/runUnscoped() (see workspaceScopePlugin.js),
 * matching how the pre-extraction endpoint relied on request-level context.
 */
export async function createDepartmentCore({ name, description, managers, workspaceId, session } = {}) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) {
    throw new ErrorResponse('Department name is required', 400);
  }

  let existingQuery = Department.findOne({ name: trimmedName });
  if (session) existingQuery = existingQuery.session(session);
  const existing = await existingQuery;
  if (existing) {
    throw new ErrorResponse(`A department named "${trimmedName}" already exists in this workspace`, 400);
  }

  const [department] = await Department.create(
    [{ name: trimmedName, description, managers: managers || [], members: [] }],
    { session }
  );

  if (managers && managers.length > 0) {
    await WorkspaceMembership.updateMany(
      { workspace: workspaceId, status: 'active', user: { $in: managers } },
      { $addToSet: { department: department._id } },
      { session }
    );
    // Invalidate legacy caches after the membership write. Never edit a
    // global User authorization mirror when creating a tenant department.
    await Promise.all(managers.map((managerId) => syncMembershipFromUser(managerId, workspaceId)));
  }

  return department;
}

export default createDepartmentCore;
