import AccessAuditLog from '../models/AccessAuditLog.js';
export async function auditAccess({ ctx, action, targetType, targetId, targetUser, before, after, reason, session }) {
  return AccessAuditLog.create([{ workspace: ctx.workspaceId, actor: ctx.userId, actorKind: ctx.kind, action, targetType, targetId, targetUser, before, after, reason, requestId: ctx.requestId }], { session });
}
