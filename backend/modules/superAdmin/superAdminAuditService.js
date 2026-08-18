import mongoose from 'mongoose';
import SuperAdminAuditLog from '../../models/SuperAdminAuditLog.js';
import { emitSuperAdminAuditLogCreated } from '../../realtime/emitters.js';

/**
 * Platform-level audit trail writer/reader for the Super Admin Dashboard.
 * Mirrors modules/permissions/auditLogService.js's exact conventions
 * (denormalize actor/target at write time, never throw on write failure,
 * cursor pagination with a `limit+1` fetch instead of a count() query) but
 * targets the dedicated SuperAdminAuditLog collection — see that model file
 * for why this isn't just another category on the existing AuditLog.
 *
 * Never log passwords, invitation tokens, auth secrets, or API secrets.
 */
export async function recordSuperAdminAuditLog({
  actor = null,
  workspace = null,
  workspaceName,
  action,
  targetType,
  targetId,
  targetName,
  targetEmail,
  reason = '',
  resourceKey,
  resourceLabel,
  summary,
  changeDetails = [],
  before,
  after,
  meta = {}
}) {
  let entry;
  try {
    entry = await SuperAdminAuditLog.create({
      actor: actor?._id || actor?.id || null,
      workspace: workspace || null,
      workspaceName,
      action,
      category: 'super_admin',
      targetType,
      targetId,
      targetName,
      targetEmail,
      reason,
      resourceKey,
      resourceLabel,
      summary,
      changeDetails,
      changes: { before, after },
      actorName: actor?.name,
      actorEmail: actor?.email,
      ipAddress: meta.ip,
      userAgent: meta.userAgent
    });
  } catch (error) {
    console.error('Failed to record Super Admin audit log entry:', { action, targetType, targetId, error: error.message });
    return;
  }

  // Separate try/catch: a socket-emit failure must never be conflated with
  // (or mask) a DB-write failure above, and standalone CLI scripts
  // (scripts/grantSuperAdmin.js, the SUPER_ADMIN_EMAILS boot check) never
  // call socketManager.init(), so getIO() throws there by design — that's
  // expected outside a running server process, not an error worth logging.
  try {
    emitSuperAdminAuditLogCreated({
      _id: entry._id,
      action: entry.action,
      actorName: entry.actorName,
      actorEmail: entry.actorEmail,
      workspace: entry.workspace,
      workspaceName: entry.workspaceName,
      targetType: entry.targetType,
      targetName: entry.targetName,
      summary: entry.summary,
      createdAt: entry.createdAt
    });
  } catch {
    // Socket.IO not initialized (standalone script) — nothing to do.
  }
}

const LIST_PROJECTION = '-changeDetails -changes -ipAddress -userAgent -__v';

/**
 * Cursor (keyset) pagination — same shape/rationale as
 * modules/permissions/auditLogService.js#queryAuditLog: fetch limit+1 rows,
 * no count() query, sort/filter on _id alone.
 */
export async function querySuperAdminAuditLog({
  workspaceId,
  cursor,
  limit = 50,
  sort = 'newest',
  startDate,
  endDate,
  actorId,
  action,
  search
} = {}) {
  const filter = {};
  if (workspaceId && mongoose.Types.ObjectId.isValid(workspaceId)) filter.workspace = workspaceId;
  if (actorId && mongoose.Types.ObjectId.isValid(actorId)) filter.actor = actorId;
  if (action) filter.action = action;

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  if (search && search.trim()) {
    const s = search.trim();
    const regex = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { summary: regex },
      { actorName: regex },
      { actorEmail: regex },
      { workspaceName: regex },
      { targetName: regex },
      { targetEmail: regex },
      { reason: regex },
      { action: regex }
    ];
  }

  const sortDir = sort === 'oldest' ? 1 : -1;
  if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
    filter._id = sortDir === -1 ? { $lt: new mongoose.Types.ObjectId(cursor) } : { $gt: new mongoose.Types.ObjectId(cursor) };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

  const rows = await SuperAdminAuditLog.find(filter)
    .select(LIST_PROJECTION)
    .sort({ _id: sortDir })
    .limit(safeLimit + 1)
    .lean();

  const hasMore = rows.length > safeLimit;
  const page = hasMore ? rows.slice(0, safeLimit) : rows;
  const nextCursor = hasMore ? String(page[page.length - 1]._id) : null;

  return { data: page, nextCursor, hasMore };
}

/**
 * Full detail for one entry — fetched only when a row is expanded.
 */
export async function getSuperAdminAuditLogDetail(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return SuperAdminAuditLog.findById(id)
    .select('action summary resourceLabel changeDetails changes reason actorName actorEmail targetName targetEmail workspace workspaceName createdAt ipAddress userAgent')
    .lean();
}
