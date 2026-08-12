import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import Role from '../../models/Role.js';

/**
 * The one resolver every "can this user invite members / approve join
 * requests in this workspace" check should go through. Never compare
 * WorkspaceMembership.role to a literal role string for these two actions —
 * that's exactly the hardcoding this system replaces (see Role.js's
 * permissionSchema: canInviteMembers / canApproveJoinRequests).
 */
export async function hasWorkspacePermission(userId, workspaceId, permissionKey) {
  const membership = await WorkspaceMembership.findOne({
    user: userId,
    workspace: workspaceId,
    status: 'active'
  }).lean();
  if (!membership) return false;

  // Defense-in-depth bypass, matches modules/permissions/permissionEngine.js's
  // existing admin-bypass convention — admin's own Role.permissions already
  // has both new keys set true anyway, this just skips the extra lookup.
  if (membership.role === 'admin') return true;

  const roleDoc = membership.roleId
    ? await Role.findById(membership.roleId).lean()
    : await Role.findResolvable(membership.role, workspaceId).lean();
  if (!roleDoc) return false;

  return grantsPermission(roleDoc, permissionKey);
}

// System role templates' persisted `permissions` field is not the source of
// truth — roleController.js's own read paths (getRoles/getRole/
// getMyPermissions) discard it and substitute Role.getDefaultPermissions(slug)
// live on every read. Mirroring that here keeps this check from drifting out
// of sync with what the Edit Role UI actually shows an admin.
function grantsPermission(roleDoc, permissionKey) {
  if (!roleDoc) return false;
  if (roleDoc.isSystem) {
    return Role.getDefaultPermissions(roleDoc.slug)[permissionKey] === true;
  }
  return roleDoc.permissions?.[permissionKey] === true;
}

/**
 * Every active member of this workspace who holds `permissionKey` — used to
 * notify "everyone who can approve" without ever naming a role string (e.g.
 * "notify Admins" would be exactly the hardcoding this system exists to
 * avoid). Resolves each distinct role once, not once per member.
 */
export async function listWorkspaceMembersWithPermission(workspaceId, permissionKey) {
  const memberships = await WorkspaceMembership.find({
    workspace: workspaceId,
    status: 'active'
  }).select('user role roleId').lean();

  if (memberships.length === 0) return [];

  const roleIds = [...new Set(memberships.filter((m) => m.roleId).map((m) => String(m.roleId)))];
  const roleDocsById = new Map();
  if (roleIds.length > 0) {
    const roleDocs = await Role.find({ _id: { $in: roleIds } }).lean();
    roleDocs.forEach((r) => roleDocsById.set(String(r._id), r));
  }

  const slugCache = new Map(); // fallback resolution for memberships with no roleId
  const userIds = [];

  for (const m of memberships) {
    if (m.role === 'admin') {
      userIds.push(m.user);
      continue;
    }

    let roleDoc = m.roleId ? roleDocsById.get(String(m.roleId)) : null;
    if (!roleDoc) {
      const cacheKey = m.role || 'employee';
      if (!slugCache.has(cacheKey)) {
        slugCache.set(cacheKey, await Role.findResolvable(cacheKey, workspaceId).lean());
      }
      roleDoc = slugCache.get(cacheKey);
    }

    if (grantsPermission(roleDoc, permissionKey)) userIds.push(m.user);
  }

  return userIds;
}

export default { hasWorkspacePermission, listWorkspaceMembersWithPermission };
