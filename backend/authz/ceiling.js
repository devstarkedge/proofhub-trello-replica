import { CATALOG, SCOPE_RANK } from './catalog.js';
import { can, id } from './engine.js';
export function canGrant(actor, permission, scope) {
  const entry = CATALOG[permission];
  if (!entry || entry.ownerOnly || !entry.allowedScopes.includes(scope)) return false;
  if (actor?.isOwner) return true;
  if (entry.sensitive && !actor?.role?.locked) return false;
  if (!can(actor, permission) || actor.denies?.[permission]?.length) return false;
  return (actor.grants?.[permission] || []).some(g => !g.scopeIds?.length && (g.scope === scope || ['project', 'department', 'workspace'].includes(g.scope) && SCOPE_RANK[g.scope] >= SCOPE_RANK[scope]));
}
export function canManageMember(actor, target) {
  if (!actor || !target || actor.status !== 'active' || id(actor.workspaceId) !== id(target.workspaceId) || id(actor.userId) === id(target.userId) || target.isOwner) return false;
  if (target.role?.locked) return actor.isOwner || actor.role?.locked === true;
  return Object.entries(target.grants || {}).every(([permission, grants]) => grants.every(g => canGrant(actor, permission, g.scope)));
}
export function canAssignRole(actor, target, role) {
  return role?.isActive === true && (!target || canManageMember(actor, target) && (role.kind || 'member') === target.kind) && role.grants.every(g => canGrant(actor, g.permission, g.scope));
}
export function canEditRole(actor, role, grants) {
  return can(actor, 'access.manage_roles') && !role.locked && id(actor.role?.id) !== id(role._id) && grants.every(g => canGrant(actor, g.permission, g.scope) && (role.kind !== 'guest' || CATALOG[g.permission].guestAllowed && g.scope === 'project'));
}
export function overrideRejection(actor, target, input, now = Date.now()) {
  if (!can(actor, 'access.manage_overrides') || !canManageMember(actor, target)) return 'cannot_manage_member';
  if (target.role?.locked && !actor.isOwner) return 'owner_required';
  const entry = CATALOG[input.permission];
  if (!entry || entry.ownerOnly || !entry.allowedScopes.includes(input.scope) || !['grant', 'deny'].includes(input.effect)) return 'invalid_permission';
  if (!canGrant(actor, input.permission, input.scope)) return 'above_ceiling';
  if (typeof input.reason !== 'string' || input.reason.trim().length < 10) return 'reason_required';
  if (input.expiresAt && (!Number.isFinite(new Date(input.expiresAt).getTime()) || new Date(input.expiresAt).getTime() <= now)) return 'invalid_expiry';
  if (input.effect === 'grant' && entry.sensitive && (!input.expiresAt || new Date(input.expiresAt).getTime() - now > 90 * 86400000)) return 'sensitive_expiry_required';
  if (target.kind === 'guest' && input.effect === 'grant' && (!entry.guestAllowed || input.scope !== 'project' || !input.scopeIds?.length || input.scopeIds.some(p => !target.guestProjects?.[id(p)]))) return 'guest_scope_cap';
  return null;
}
