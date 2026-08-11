import AccessOverride from '../../models/AccessOverride.js';
import Role from '../../models/Role.js';
import { RESOURCES, getResourceActionKeys } from '../../config/permissionRegistry.js';
import { ensureDefaultWorkspace } from './workspaceService.js';

/**
 * The single permission resolver. Every consumer — sidebar visibility,
 * module action buttons, API authorization, and the permission-picker UI —
 * calls through here. No module should implement its own access check.
 *
 * Precedence (evaluated fresh on every call, never from a stale cache):
 *   1. Explicit deny override            — always wins, even over Admin
 *   2. Admin role                        — full access to everything
 *   3. Explicit grant override           — including scope + expiry
 *   4. Role default (only 'access_control.manage' has one today)
 *   5. Default deny
 */

const isExpired = (doc) => Boolean(doc?.expiresAt && new Date(doc.expiresAt).getTime() <= Date.now());

const actionsToObject = (actions) => {
  if (!actions) return {};
  if (actions instanceof Map) return Object.fromEntries(actions);
  return { ...actions };
};

const allActionsAs = (resource, value) =>
  getResourceActionKeys(resource).reduce((acc, key) => {
    acc[key] = value;
    return acc;
  }, {});

/**
 * Fetch the active, non-expired override for a user+resource, or null.
 * Expired grants are treated as if they don't exist — no cron job required
 * for correctness; a cleanup sweep only exists for UI/data hygiene.
 */
export async function getActiveOverride(userId, resource, workspaceId) {
  if (!userId || !resource) return null;
  const workspace = workspaceId || (await ensureDefaultWorkspace());
  const doc = await AccessOverride.findOne({
    workspace,
    user: userId,
    resource: String(resource).toLowerCase(),
    isActive: true
  }).lean();
  if (!doc || isExpired(doc)) return null;
  return doc;
}

/**
 * Resolve the effective action map for one user + one resource, within one
 * workspace. `workspaceId` defaults to `user.workspaceId` — set by the
 * `protect` middleware's per-request overlay — so callers that pass
 * `req.user` need no change; callers resolving a *different* user's access
 * (e.g. an admin managing someone else's Sales grant) must pass the actor's
 * active workspace explicitly, since the target User document itself never
 * carries a workspace (a user can belong to several).
 */
export async function resolveResourceAccess(user, resource, workspaceId) {
  const key = String(resource || '').toLowerCase();
  if (!RESOURCES[key]) {
    throw new Error(`Unknown permission resource: ${resource}`);
  }

  const ws = workspaceId || user?.workspaceId || (await ensureDefaultWorkspace());
  const userId = user._id || user.id;
  const role = String(user.role || '').toLowerCase();
  const override = await getActiveOverride(userId, key, ws);

  // 1. Explicit deny always wins, even over Admin.
  if (override?.effect === 'deny') {
    return { resource: key, actions: allActionsAs(key, false), scope: 'none', source: 'deny-override', override };
  }

  // 2. Admin — full access.
  if (role === 'admin') {
    return { resource: key, actions: allActionsAs(key, true), scope: 'full', source: 'admin' };
  }

  // 3. Explicit grant override.
  if (override?.effect === 'grant') {
    return {
      resource: key,
      actions: { ...allActionsAs(key, false), ...actionsToObject(override.actions) },
      scope: override.scope || 'full',
      scopedResourceIds: override.scopedResourceIds || [],
      expiresAt: override.expiresAt || null,
      source: 'override',
      override
    };
  }

  // 4. Role default. Only 'access_control.manage' has a role-level default
  // today (Role.permissions.canManageAccessControl) — Sales/Finance remain
  // 100% per-user-override, matching pre-migration behavior exactly.
  if (key === 'access_control') {
    const canManage = await roleGrantsAccessControlManage(role, ws);
    return {
      resource: key,
      actions: { manage: canManage },
      scope: canManage ? 'full' : 'none',
      source: 'role-default'
    };
  }

  // 5. Default deny.
  return { resource: key, actions: allActionsAs(key, false), scope: 'none', source: 'default-deny' };
}

async function roleGrantsAccessControlManage(roleSlug, workspaceId) {
  const roleDoc = await Role.findResolvable(roleSlug, workspaceId);
  if (!roleDoc) return false;
  if (roleDoc.isSystem) {
    return Role.getDefaultPermissions(roleDoc.slug).canManageAccessControl === true;
  }
  return roleDoc.permissions?.canManageAccessControl === true;
}

export async function hasResourceAction(user, resource, actionKey, workspaceId) {
  if (!user) return false;
  const result = await resolveResourceAccess(user, resource, workspaceId);
  return result.actions?.[actionKey] === true;
}

/**
 * Delegated administration check for the Access & Permissions module itself.
 * Admin always passes; anyone else needs either their role's
 * canManageAccessControl flag or a personal 'access_control' grant override.
 */
export async function canManageAccessControl(user, workspaceId) {
  if (!user) return false;
  if (String(user.role || '').toLowerCase() === 'admin') return true;
  return hasResourceAction(user, 'access_control', 'manage', workspaceId);
}
