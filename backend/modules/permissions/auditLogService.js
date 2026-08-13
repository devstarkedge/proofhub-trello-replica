import mongoose from 'mongoose';
import AuditLog from '../../models/AuditLog.js';
import { ensureDefaultWorkspace } from './workspaceService.js';

const ACCESS_CONTROL_CATEGORY = 'access_control';

/**
 * Every permission-changing write in the app records one entry here.
 * Reuses the shared AuditLog collection (see model file for why) but always
 * stamps `category: 'access_control'` so the centralized module's Activity
 * Log only ever queries its own writes, never another module's (e.g. the
 * finance milestone service, which writes to the same collection with no
 * category at all).
 *
 * Denormalizes actor/target name/email/role at write time — an audit trail
 * must still read correctly after the person's name changes, and it avoids
 * an N+1 User lookup per row when listing at scale.
 *
 * Never throws: a logging failure must not block the permission change it's
 * recording, but it's logged loudly so a persistent failure doesn't go
 * unnoticed.
 */
export async function recordAuditLog({
  actor,
  target = null,
  action,
  targetType,
  targetId,
  resourceKey,
  resourceLabel,
  summary,
  changeDetails = [],
  before,
  after,
  meta = {},
  // Defaults to the access-control category so every pre-existing call site
  // (none of which pass this) keeps writing exactly what it always has.
  // The centralized Invite Member system passes 'workspace_member' so its
  // trail stays queryable separately (see queryAuditLog's own category
  // filter — already parameterized, this was the one-sided gap).
  category = ACCESS_CONTROL_CATEGORY,
  // The two actor-less Invite Member lifecycle events (invitation
  // opened/expired) have no logged-in user — denormalize an email directly
  // instead of via `actor`.
  actorEmail
}) {
  try {
    const workspace = meta.workspaceId || await ensureDefaultWorkspace();
    await AuditLog.create({
      actor: actor?._id || actor?.id,
      workspace,
      action,
      category,
      targetType,
      targetId,
      resourceKey,
      resourceLabel,
      summary,
      changeDetails,
      changes: { before, after },
      actorName: actor?.name,
      actorEmail: actor?.email || actorEmail,
      actorRole: actor?.role,
      targetName: target?.name,
      targetEmail: target?.email,
      targetRole: target?.role,
      ipAddress: meta.ip,
      userAgent: meta.userAgent
    });
  } catch (error) {
    console.error('Failed to record audit log entry:', { action, targetType, targetId, error: error.message });
  }
}

const LIST_PROJECTION = '-changeDetails -changes -ipAddress -userAgent -workspace -__v';

/**
 * Cursor (keyset) pagination — no `skip()`, so page 10,000 is exactly as
 * cheap as page 1. Cursor is the last-seen document's `_id`; ObjectIds are
 * monotonically increasing at creation time, so sorting/filtering on `_id`
 * alone is a correct, single-field substitute for a createdAt+_id compound
 * cursor, and it's covered by the indexes on the model.
 */
export async function queryAuditLog({
  workspaceId,
  category = ACCESS_CONTROL_CATEGORY,
  cursor,
  limit = 50,
  sort = 'newest',
  startDate,
  endDate,
  targetId,
  actorId,
  resourceKey,
  action,
  search
} = {}) {
  const workspace = workspaceId || await ensureDefaultWorkspace();
  const filter = { workspace, category };

  if (targetId && mongoose.Types.ObjectId.isValid(targetId)) filter.targetId = targetId;
  if (actorId && mongoose.Types.ObjectId.isValid(actorId)) filter.actor = actorId;
  if (resourceKey) filter.resourceKey = resourceKey;
  if (action) filter.action = action;

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  if (search && search.trim()) {
    filter.$text = { $search: search.trim() };
  }

  const sortDir = sort === 'oldest' ? 1 : -1;
  if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
    filter._id = sortDir === -1 ? { $lt: new mongoose.Types.ObjectId(cursor) } : { $gt: new mongoose.Types.ObjectId(cursor) };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

  // Fetch one extra row to know whether another page exists without a
  // separate count() query (count() over millions of rows is expensive and
  // unnecessary — we only need a boolean).
  const rows = await AuditLog.find(filter)
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
 * Full detail for one entry — the curated `changeDetails` diff and, if
 * present, the raw `changes.before/after` blobs. Fetched only when a log
 * row is expanded, never as part of the list.
 */
export async function getAuditLogDetail(id, workspaceId) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const workspace = workspaceId || await ensureDefaultWorkspace();
  return AuditLog.findOne({ _id: id, workspace })
    .select('action summary resourceLabel changeDetails changes actorName targetName createdAt')
    .lean();
}
