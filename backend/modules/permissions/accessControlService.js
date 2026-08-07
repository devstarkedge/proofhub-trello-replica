import User from '../../models/User.js';
import AccessOverride from '../../models/AccessOverride.js';
import Role from '../../models/Role.js';
import { RESOURCES, RESOURCE_KEYS, toLegacyShape } from '../../config/permissionRegistry.js';
import { resolveResourceAccess, canManageAccessControl } from './permissionEngine.js';
import { ensureDefaultWorkspace } from './workspaceService.js';
import { invalidateAuthCache } from '../../middleware/authMiddleware.js';
import { emitToUser } from '../../realtime/index.js';
import { recordAuditLog } from './auditLogService.js';

const forbidden = (message) => {
  const err = new Error(message);
  err.statusCode = 403;
  return err;
};

/**
 * SECURITY: no one — including Admin — may grant, revoke, or update their
 * own permissions through these endpoints. This is enforced here, at the
 * service layer, so it protects every write path that funnels through
 * setResourceOverride/clearResourceOverride: the centralized module's
 * overrides API, and the legacy Sales/Finance endpoints that now delegate
 * to the same function.
 */
const assertNotSelf = (actorId, targetUserId) => {
  if (actorId && targetUserId && String(actorId) === String(targetUserId)) {
    throw forbidden('You cannot modify your own permissions.');
  }
};

const RESOURCE_MODULE_LABEL = {
  access_control: 'Delegated Access & Permissions Management'
};

/**
 * Builds the human-readable audit fields (summary sentence + curated
 * before/after diff) for one resource-override write, computed once here
 * at write time so the audit log never needs to re-derive meaning from raw
 * before/after JSON later.
 *
 * `beforeActions` / `afterActions` are the raw engine action maps
 * ({ manage: true/false, view: true/false, ... }) captured before and after
 * the write. They are needed for actions that have `legacyField: null`
 * (e.g. access_control.manage) — those actions are invisible to the
 * toLegacyShape() conversion, so without the raw maps their changes would
 * never be detected and the audit log entry would be silently skipped.
 */
const describeResourceChange = (key, before, after, actorName, targetName, beforeActions = {}, afterActions = {}) => {
  const resourceDef = RESOURCES[key];

  const changeDetails = resourceDef.actions
    .filter(({ legacyField, key: actionKey }) => {
      if (legacyField) {
        // Standard path: compare the legacy field values.
        return before[legacyField] !== after[legacyField];
      }
      // Non-legacy path (e.g. access_control.manage): compare raw action maps.
      return beforeActions[actionKey] !== afterActions[actionKey];
    })
    .map(({ label, legacyField, key: actionKey }) => ({
      label,
      previous: legacyField ? before[legacyField] : beforeActions[actionKey],
      next:     legacyField ? after[legacyField]  : afterActions[actionKey]
    }));

  // Determine action verb:
  //   • If the primary "view" action changed  → grant or revoke
  //   • If any non-legacy action changed       → grant or revoke based on final state
  //   • Otherwise                              → update
  const viewAction  = resourceDef.actions.find((a) => a.key === 'view');
  const viewField   = viewAction?.legacyField;
  let actionVerb    = 'update';

  if (viewField && before[viewField] !== after[viewField]) {
    actionVerb = after[viewField] ? 'grant' : 'revoke';
  } else if (!viewField) {
    // Resource has no "view" action (e.g. access_control).
    // Use the manage/primary action's final state to pick the verb.
    const primaryAction = resourceDef.actions[0];
    if (primaryAction && !primaryAction.legacyField) {
      const finalValue = afterActions[primaryAction.key];
      actionVerb = finalValue ? 'grant' : 'revoke';
    } else if (changeDetails.length > 0) {
      actionVerb = 'update';
    }
  } else if (changeDetails.length > 0) {
    actionVerb = 'update';
  }

  const resourceLabel = RESOURCE_MODULE_LABEL[key] || `${resourceDef.label} Module Access`;
  const verbPast      = { grant: 'granted', revoke: 'revoked', update: 'updated' }[actionVerb];
  const preposition   = actionVerb === 'revoke' ? 'from' : actionVerb === 'grant' ? 'to' : 'for';
  const summary       = `${actorName} ${verbPast} ${resourceLabel} ${preposition} ${targetName}`;
  const action        = { grant: 'PERMISSION_GRANTED', revoke: 'PERMISSION_REVOKED', update: 'PERMISSION_UPDATED' }[actionVerb];

  return { changeDetails, resourceLabel, summary, action, hasChanges: changeDetails.length > 0 };
};

/**
 * Write path shared by every consumer that used to own its own permission
 * table: the Sales module matrix, the Finance access toggle, and delegated
 * access_control.manage grants all funnel through this one function.
 *
 * Emits both the resource-specific legacy event name (e.g.
 * 'sales:permissions:updated') with the old field-shaped payload — so
 * already-shipped listeners (Sidebar, SalesPage, FinanceRouteGuard) keep
 * working with zero changes — and a new unified 'access-control:updated'
 * event for anything built against the new engine.
 */
export async function setResourceOverride(targetUserId, resource, payload = {}, actor, meta = {}) {
  const key = String(resource || '').toLowerCase();
  if (!RESOURCES[key]) {
    throw new Error(`Unknown permission resource: ${resource}`);
  }

  const actorId = actor?._id || actor?.id;
  assertNotSelf(actorId, targetUserId);

  const targetUser = await User.findById(targetUserId).select('role name email');
  if (!targetUser) {
    throw new Error('User not found');
  }

  const effect = payload.effect === 'deny' ? 'deny' : 'grant';

  // A plain "grant" override on an Admin is meaningless (Admin already has
  // full access) — but an explicit "deny" must still be settable, since that
  // is exactly the suspension use case the override table exists for.
  if (targetUser.role === 'admin' && effect !== 'deny') {
    throw new Error('Admin access cannot be overridden with a grant. Use effect: "deny" to suspend an admin.');
  }

  const beforeAccess = await resolveResourceAccess(targetUser, key);
  const before = toLegacyShape(key, beforeAccess.actions);

  const workspace = await ensureDefaultWorkspace();
  const {
    actions = {},
    scope = 'full',
    scopedResourceIds = [],
    expiresAt = null,
    reason = ''
  } = payload;

  await AccessOverride.findOneAndUpdate(
    { user: targetUserId, resource: key },
    {
      $set: {
        workspace,
        effect,
        actions,
        scope,
        scopedResourceIds,
        expiresAt: expiresAt || null,
        reason,
        grantedBy: actorId,
        isActive: true
      },
      $setOnInsert: { user: targetUserId, resource: key }
    },
    { new: true, upsert: true, runValidators: true }
  );

  invalidateAuthCache(targetUserId);

  const result = await emitAndReturnEffective(targetUserId, targetUser, key);

  const described = describeResourceChange(
    key,
    before,
    result.legacyPermissions,
    actor?.name,
    targetUser.name,
    beforeAccess.actions,          // raw action map BEFORE
    result.effective?.actions || {} // raw action map AFTER
  );
  if (described.hasChanges) {
    await recordAuditLog({
      actor,
      target: targetUser,
      action: described.action,
      targetType: 'AccessOverride',
      targetId: targetUserId,
      resourceKey: key,
      resourceLabel: described.resourceLabel,
      summary: described.summary,
      changeDetails: described.changeDetails,
      before: { resource: key, permissions: before },
      after: { resource: key, permissions: result.legacyPermissions, effect },
      meta
    });
  }

  return result;
}

export async function clearResourceOverride(targetUserId, resource, actor, meta = {}) {
  const key = String(resource || '').toLowerCase();
  if (!RESOURCES[key]) {
    throw new Error(`Unknown permission resource: ${resource}`);
  }

  const actorId = actor?._id || actor?.id;
  assertNotSelf(actorId, targetUserId);

  const targetUser = await User.findById(targetUserId).select('role name email');
  if (!targetUser) {
    throw new Error('User not found');
  }

  const beforeAccess = await resolveResourceAccess(targetUser, key);
  const before = toLegacyShape(key, beforeAccess.actions);

  await AccessOverride.findOneAndUpdate(
    { user: targetUserId, resource: key },
    { $set: { isActive: false, grantedBy: actorId } }
  );

  invalidateAuthCache(targetUserId);

  const result = await emitAndReturnEffective(targetUserId, targetUser, key);

  const described = describeResourceChange(
    key,
    before,
    result.legacyPermissions,
    actor?.name,
    targetUser.name,
    beforeAccess.actions,
    result.effective?.actions || {}
  );
  if (described.hasChanges) {
    await recordAuditLog({
      actor,
      target: targetUser,
      action: 'PERMISSION_REVOKED',
      targetType: 'AccessOverride',
      targetId: targetUserId,
      resourceKey: key,
      resourceLabel: RESOURCE_MODULE_LABEL[key] || `${RESOURCES[key].label} Module Access`,
      summary: `${actor?.name} reverted ${RESOURCE_MODULE_LABEL[key] || `${RESOURCES[key].label} access`} for ${targetUser.name} to role default`,
      changeDetails: described.changeDetails,
      before: { resource: key, permissions: before },
      after: { resource: key, permissions: result.legacyPermissions, effect: 'cleared' },
      meta
    });
  }

  return result;
}

async function emitAndReturnEffective(targetUserId, targetUser, resourceKey) {
  const effective = await resolveResourceAccess(targetUser, resourceKey);
  const legacyPermissions = toLegacyShape(resourceKey, effective.actions);

  try {
    emitToUser(targetUserId.toString(), `${resourceKey}:permissions:updated`, {
      userId: targetUserId,
      permissions: legacyPermissions
    });
    emitToUser(targetUserId.toString(), 'access-control:updated', {
      userId: targetUserId,
      resource: resourceKey,
      effective
    });
  } catch (err) {
    console.error('Error emitting access-control update:', err);
  }

  return { effective, legacyPermissions };
}

/**
 * Full effective-permissions snapshot for one user: every resource's action
 * map, the role's 14/15-key checklist, the HR Panel access scope, and
 * whether they can manage the Access & Permissions module. This is what
 * powers /api/access-control/my-permissions and the per-user admin view.
 */
export async function resolveEffectivePermissions(user) {
  const resources = {};
  for (const key of RESOURCE_KEYS) {
    const result = await resolveResourceAccess(user, key);
    resources[key] = result.actions;
  }

  const role = String(user.role || '').toLowerCase();
  const roleDoc = await Role.findOne({ slug: role }).lean();

  let roleChecklist;
  if (!roleDoc) {
    roleChecklist = Role.getDefaultPermissions(role);
  } else if (roleDoc.isSystem) {
    roleChecklist = Role.getDefaultPermissions(roleDoc.slug);
  } else {
    roleChecklist = roleDoc.permissions;
  }

  return {
    role,
    isAdmin: role === 'admin',
    resources,
    roleChecklist,
    accessScope: {
      type: user.accessType || 'full_department',
      allowedProjects: user.allowedProjects || []
    },
    canManageAccessControl: await canManageAccessControl(user)
  };
}

export async function getEffectivePermissionsForUser(targetUserId) {
  const targetUser = await User.findById(targetUserId).select('-password');
  if (!targetUser) return null;
  return resolveEffectivePermissions(targetUser);
}
