import Department from '../../models/Department.js';
import * as workspaceContext from './workspaceContext.js';

// Reuse the existing roster convention in every assignment writer and reader.
export const departmentRosterFieldForRole = (roleSlug) => ['admin', 'manager'].includes(roleSlug) ? 'managers' : 'members';

export async function syncUserDepartmentRoster({ workspaceId, userId, departmentIds, roleSlug, previousRole }) {
  const target = departmentRosterFieldForRole(roleSlug);
  const opposite = target === 'managers' ? 'members' : 'managers';
  await Department.updateMany({ workspaceId, _id: { $nin: departmentIds }, $or: [{ members: userId }, { managers: userId }] }, { $pull: { members: userId, managers: userId } });
  const update = { $addToSet: { [target]: userId } };
  // Preserve explicit manager appointments for custom/member roles. A role
  // transition or the established manager convention moves the roster entry.
  if (target === 'managers' || previousRole !== roleSlug) update.$pull = { [opposite]: userId };
  await Department.updateMany({ workspaceId, _id: { $in: departmentIds } }, update);
}

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
export async function addUserToDepartmentRoster(workspaceId, departmentId, userId, roleSlug, { session = null } = {}) {
  if (!departmentId) return;

  await workspaceContext.run({ workspaceId }, async () => {
    const dept = await Department.findById(departmentId).session(session);
    if (!dept) return;

    const targetArray = departmentRosterFieldForRole(roleSlug);
    const oppositeArray = targetArray === 'managers' ? 'members' : 'managers';

    dept[oppositeArray] = dept[oppositeArray].filter((id) => id.toString() !== userId.toString());
    if (!dept[targetArray].some((id) => id.toString() === userId.toString())) {
      dept[targetArray].push(userId);
    }
    await dept.save({ session });
  });
}

export default addUserToDepartmentRoster;
