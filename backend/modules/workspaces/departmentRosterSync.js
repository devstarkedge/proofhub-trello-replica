import Department from '../../models/Department.js';
import * as workspaceContext from './workspaceContext.js';

/**
 * Adds a user to a department's managers/members array. WorkspaceMembership
 * .department is the newer source of truth, but older UI (e.g.
 * EmployeeAssignment.jsx's per-department roster) still reads these
 * Department-side arrays directly — this mirrors the exact dual-write
 * pattern userController.js#assignUser already uses, so a member added
 * through the centralized Invite Member modal shows up there too.
 *
 * Which array depends on the role being granted IN THIS WORKSPACE, not the
 * user's global User.role (those can differ across workspaces).
 */
export async function addUserToDepartmentRoster(workspaceId, departmentId, userId, roleSlug) {
  if (!departmentId) return;

  await workspaceContext.run({ workspaceId }, async () => {
    const dept = await Department.findById(departmentId);
    if (!dept) return;

    const isManagerRole = roleSlug === 'admin' || roleSlug === 'manager';
    const targetArray = isManagerRole ? 'managers' : 'members';
    const oppositeArray = isManagerRole ? 'members' : 'managers';

    dept[oppositeArray] = dept[oppositeArray].filter((id) => id.toString() !== userId.toString());
    if (!dept[targetArray].some((id) => id.toString() === userId.toString())) {
      dept[targetArray].push(userId);
    }
    await dept.save();
  });
}

export default addUserToDepartmentRoster;
