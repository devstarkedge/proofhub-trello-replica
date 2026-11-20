import { createHash } from 'node:crypto';
import { createVersionedReadCache } from '../../services/versionedReadCache.js';
import { getActiveWorkspaceId } from '../workspaces/workspaceContext.js';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cache = createVersionedReadCache('tracking-read');
export const cachedTrackingRead = cache.read;
export const invalidateTrackingReads = cache.invalidate;
export const observeTrackingRead = cache.observe;
export const trackingReadCacheStats = cache.stats;

// Only metadata leaves MongoDB. Authorization context is rebuilt on every
// request; changing any role, override, membership, project or department fact
// produces a different key. Never cache an authorization decision itself.
export function trackingAccessFingerprint(ctx, scope) {
  return digest({ mode: process.env.AUTHZ_V2, user: ctx.userId, workspace: ctx.workspaceId,
    grants: ctx.grants, denies: ctx.denies, restriction: ctx.restriction,
    assignedTaskIds: ctx.assignedTaskIds, assignedProjectIds: ctx.assignedProjectIds, records: ctx.resolvedRecords,
    denied: ctx.trackingDenied, projects: ctx.trackingLegacyProjectIds,
    members: scope?.members, roles: scope ? [...scope.roleMap] : ctx.trackingReadRoles,
    projectRecords: scope ? [...scope.projectMap] : ctx.trackingProjectRecords,
    history: scope?.members.map(member => [String(member.user), scope.history(member.user)]) });
}

// Invalidation belongs at the model boundary: uploads, recovery, edits,
// retention and direct service writes all run through these hooks.
export function trackingReadCachePlugin(schema) {
  schema.post('save', async function (doc) { await invalidateTrackingReads(doc.workspaceId); });
  schema.post('insertMany', async function (docs) {
    await Promise.all([...new Set(docs.map(doc => String(doc.workspaceId)))].map(invalidateTrackingReads));
  });
  schema.post(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'], async function (result) {
    const update = this.getUpdate?.();
    // Heartbeats write-lock policy/session revisions without changing any
    // report fields. Invalidating on those fences defeats caching in a team.
    if (update && !this.getOptions().upsert && Object.entries(update).filter(([operator]) => operator !== '$setOnInsert').every(([operator, fields]) =>
      operator.startsWith('$') && Object.keys(fields).every(field => ['updatedAt', '__v', 'evidenceRevision'].includes(field)))) return;
    const workspaceId = getActiveWorkspaceId() || result?.workspaceId || this.getFilter()?.workspaceId;
    if (workspaceId) await invalidateTrackingReads(workspaceId);
  });
}
