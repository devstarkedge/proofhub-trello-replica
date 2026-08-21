import mongoose from 'mongoose';
import Workspace from '../../models/Workspace.js';
import User from '../../models/User.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import WorkspaceInvitation from '../../models/WorkspaceInvitation.js';
import WorkspaceSubscription from '../../models/WorkspaceSubscription.js';
import Plan from '../../models/Plan.js';
import Board from '../../models/Board.js';
import Attachment from '../../models/Attachment.js';
import Activity from '../../models/Activity.js';
import * as workspaceContext from '../workspaces/workspaceContext.js';
import { resolveMemberLimit } from '../plans/entitlementService.js';

/**
 * Aggregation/query layer backing the Super Admin Dashboard. Centralized
 * here (rather than inline in controllers) so every screen that shows "how
 * many members/projects does workspace X have" computes it the same way —
 * per plan section 25's "don't calculate the same business metric
 * differently in different screens" rule.
 *
 * Governing rule for every read below: Workspace/User/WorkspaceMembership/
 * WorkspaceInvitation/WorkspaceSubscription/Plan are exempt from
 * workspaceScopePlugin (queried directly); Board/Card/Attachment/Activity
 * are plugin-wrapped and need an explicit workspaceContext — `runUnscoped()`
 * for cross-workspace aggregates, `run({workspaceId}, fn)` for one target
 * workspace's data.
 */

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Overview KPIs ───────────────────────────────────────────────────────

export async function getOverviewStats() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    workspacesByStatus,
    totalUsers,
    newWorkspaces30d,
    totalMembers,
    activeMembers,
    pendingInvitations,
    planDistributionRaw,
    storageRaw
  ] = await Promise.all([
    Workspace.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    User.countDocuments({}),
    Workspace.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    WorkspaceMembership.countDocuments({ status: { $ne: 'removed' } }),
    WorkspaceMembership.countDocuments({ status: 'active' }),
    WorkspaceInvitation.countDocuments({ status: 'pending' }),
    WorkspaceSubscription.aggregate([
      { $group: { _id: '$plan', count: { $sum: 1 } } },
      { $lookup: { from: 'plans', localField: '_id', foreignField: '_id', as: 'plan' } },
      { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 0, planId: '$_id', planName: '$plan.name', planSlug: '$plan.slug', count: 1 } }
    ]),
    // Mongoose's .aggregate() returns a lazy, un-executed thenable — the
    // pre('aggregate') hook that reads the active workspaceContext only
    // fires once it's actually awaited/exec()'d. runUnscoped()'s
    // AsyncLocalStorage context only covers the callback passed to it, so
    // the aggregate must be awaited FROM INSIDE that callback; returning
    // the un-awaited thenable for Promise.all to await later, outside
    // runUnscoped's callback, loses the context and throws "no active
    // workspace context" (confirmed empirically via browser testing).
    workspaceContext.runUnscoped(async () => {
      return await Attachment.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: null, totalBytes: { $sum: '$fileSize' } } }
      ]);
    })
  ]);

  const statusCounts = { active: 0, suspended: 0, archived: 0 };
  for (const row of workspacesByStatus) {
    if (row._id in statusCounts) statusCounts[row._id] = row.count;
  }
  const totalWorkspaces = statusCounts.active + statusCounts.suspended + statusCounts.archived;

  return {
    workspaces: { total: totalWorkspaces, ...statusCounts },
    members: { total: totalMembers, active: activeMembers, pendingInvitations },
    users: { totalPlatformUsers: totalUsers },
    newWorkspacesLast30Days: newWorkspaces30d,
    planDistribution: planDistributionRaw,
    // Attachment collection only — legacy embedded Board/Card attachment
    // arrays are not reconciled at platform scale (see getWorkspaceUsage,
    // which does reconcile them for a single workspace, where it's cheap).
    storage: { totalBytesLowerBound: storageRaw[0]?.totalBytes || 0 },
    // No API-usage tracking exists anywhere in this codebase. Rendered as
    // "Not available" by the frontend, never fabricated or shown as 0.
    // (Platform-wide project/task counts were deliberately removed from
    // this endpoint — not reliable/wanted as platform vanity metrics; see
    // getWorkspaceProjects for the real, per-workspace project stats that
    // remain on the workspace detail page's Projects tab.)
    apiUsage: null
  };
}

// ─── Workspace list (cursor-paginated, searchable, filterable) ──────────

export async function listWorkspaces({ cursor, limit = 50, search, status, planSlug, type, sort = 'newest' } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const sortDir = sort === 'oldest' ? 1 : -1;

  const pipeline = [];
  if (status) pipeline.push({ $match: { status } });
  if (type) pipeline.push({ $match: { type } });

  pipeline.push(
    { $lookup: { from: 'users', localField: 'owner', foreignField: '_id', as: 'ownerDoc' } },
    { $unwind: { path: '$ownerDoc', preserveNullAndEmptyArrays: true } }
  );

  if (search && search.trim()) {
    const re = new RegExp(escapeRegex(search.trim()), 'i');
    pipeline.push({
      $match: {
        $or: [
          { name: re },
          { slug: re },
          { 'ownerDoc.name': re },
          { 'ownerDoc.email': re }
        ]
      }
    });
  }

  pipeline.push(
    { $lookup: { from: 'workspacesubscriptions', localField: '_id', foreignField: 'workspace', as: 'subscription' } },
    { $unwind: { path: '$subscription', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'plans', localField: 'subscription.plan', foreignField: '_id', as: 'plan' } },
    { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } }
  );

  if (planSlug) pipeline.push({ $match: { 'plan.slug': planSlug } });

  if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
    pipeline.push({ $match: { _id: sortDir === -1 ? { $lt: new mongoose.Types.ObjectId(cursor) } : { $gt: new mongoose.Types.ObjectId(cursor) } } });
  }

  pipeline.push(
    { $sort: { _id: sortDir } },
    { $limit: safeLimit + 1 },
    {
      $project: {
        name: 1, slug: 1, status: 1, type: 1, isActive: 1, createdAt: 1, icon: 1,
        owner: { _id: '$ownerDoc._id', name: '$ownerDoc.name', email: '$ownerDoc.email' },
        plan: { _id: '$plan._id', name: '$plan.name', slug: '$plan.slug', memberLimit: '$plan.memberLimit' },
        subscriptionStatus: '$subscription.status',
        subscriptionCustomMemberLimit: '$subscription.customMemberLimit'
      }
    }
  );

  const rows = await Workspace.aggregate(pipeline);
  const hasMore = rows.length > safeLimit;
  const page = hasMore ? rows.slice(0, safeLimit) : rows;
  const nextCursor = hasMore ? String(page[page.length - 1]._id) : null;

  if (page.length === 0) {
    return { data: [], nextCursor: null, hasMore: false };
  }

  // Batched member/project counts for this page — not N+1 per-row queries.
  const pageIds = page.map((w) => w._id);
  const [memberCounts, activeMemberCounts, projectCounts, storageCounts] = await Promise.all([
    WorkspaceMembership.aggregate([
      { $match: { workspace: { $in: pageIds }, status: { $ne: 'removed' } } },
      { $group: { _id: '$workspace', count: { $sum: 1 } } }
    ]),
    WorkspaceMembership.aggregate([
      { $match: { workspace: { $in: pageIds }, status: 'active' } },
      { $group: { _id: '$workspace', count: { $sum: 1 } } }
    ]),
    workspaceContext.runUnscoped(async () => {
      return await Board.aggregate([
        { $match: { workspaceId: { $in: pageIds }, isDeleted: false } },
        { $group: { _id: '$workspaceId', count: { $sum: 1 } } }
      ]);
    }),
    workspaceContext.runUnscoped(async () => {
      return await Attachment.aggregate([
        { $match: { workspaceId: { $in: pageIds }, isDeleted: false } },
        { $group: { _id: '$workspaceId', totalBytes: { $sum: '$fileSize' } } }
      ]);
    })
  ]);

  const memberMap = new Map(memberCounts.map((r) => [String(r._id), r.count]));
  const activeMemberMap = new Map(activeMemberCounts.map((r) => [String(r._id), r.count]));
  const projectMap = new Map(projectCounts.map((r) => [String(r._id), r.count]));
  const storageMap = new Map(storageCounts.map((r) => [String(r._id), r.totalBytes]));

  const data = page.map((w) => {
    const { subscriptionCustomMemberLimit, ...rest } = w;
    return {
      ...rest,
      memberCount: memberMap.get(String(w._id)) || 0,
      activeMemberCount: activeMemberMap.get(String(w._id)) || 0,
      projectCount: projectMap.get(String(w._id)) || 0,
      storageBytes: storageMap.get(String(w._id)) || 0,
      // Free/Pro's shared Plan.memberLimit, or this specific workspace's own
      // configured Enterprise cap — never the member count itself. See
      // entitlementService.js#resolveMemberLimit.
      memberLimit: resolveMemberLimit(w.plan?.slug ? w.plan : null, { customMemberLimit: subscriptionCustomMemberLimit })
    };
  });

  return { data, nextCursor, hasMore };
}

// ─── Single-workspace detail (Overview tab) ──────────────────────────────

export async function getWorkspaceOverview(workspaceId) {
  const workspace = await Workspace.findById(workspaceId).lean();
  if (!workspace) return null;

  const [owner, subscription, memberCount, activeMemberCount, projectCount, statusChangedByUser] = await Promise.all([
    User.findById(workspace.owner).select('name email avatar isActive lastLogin').lean(),
    WorkspaceSubscription.findOne({ workspace: workspaceId }).populate('plan').lean(),
    WorkspaceMembership.countDocuments({ workspace: workspaceId, status: { $ne: 'removed' } }),
    WorkspaceMembership.countDocuments({ workspace: workspaceId, status: 'active' }),
    // Awaited from INSIDE the callback — see the identical fix/comment in
    // getOverviewStats above for why a bare `() => Board.countDocuments(...)`
    // (returned un-awaited for the outer Promise.all to resolve later) loses
    // the workspaceContext before the query actually executes.
    workspaceContext.run({ workspaceId }, async () => await Board.countDocuments({ isDeleted: false })),
    workspace.statusChangedBy ? User.findById(workspace.statusChangedBy).select('name email').lean() : null
  ]);

  return {
    workspace,
    owner,
    subscription,
    statusChangedByUser,
    memberCount,
    activeMemberCount,
    projectCount
  };
}

// ─── Members tab ──────────────────────────────────────────────────────────

export async function getWorkspaceMembers(workspaceId) {
  // WorkspaceMembership itself is exempt from workspaceScopePlugin, but
  // Role (populated via roleId below) is plugin-wrapped ({allowGlobal:true}
  // — see models/Role.js) — .populate() runs a real query against it, so
  // this whole read needs an active context even though the top-level
  // find() doesn't. Using the correct workspaceId here also makes the
  // populate correctly resolve either this workspace's own custom roles or
  // the global system-role templates, exactly like every other role
  // resolution in the app.
  const memberships = await workspaceContext.run({ workspaceId }, async () => {
    return await WorkspaceMembership.find({ workspace: workspaceId, status: { $ne: 'removed' } })
      .populate('user', 'name email avatar isActive isVerified lastLogin')
      .populate('roleId', 'name slug isSystem')
      .sort({ joinedAt: -1 })
      .limit(1000)
      .lean();
  });

  // Grouped by the ACTUAL Role document (name/slug), not a hardcoded
  // Manager/Employee/HR bucket list — this workspace may use custom roles.
  const roleBreakdown = new Map();
  let activeCount = 0;
  let suspendedCount = 0;
  for (const m of memberships) {
    if (m.status === 'active') activeCount++;
    if (m.status === 'suspended') suspendedCount++;
    const key = m.roleId?.name || m.role || 'Unknown';
    roleBreakdown.set(key, (roleBreakdown.get(key) || 0) + 1);
  }

  const pendingInvitations = await WorkspaceInvitation.countDocuments({ workspace: workspaceId, status: 'pending' });

  return {
    members: memberships,
    stats: {
      total: memberships.length,
      active: activeCount,
      suspended: suspendedCount,
      pendingInvitations,
      byRole: Object.fromEntries(roleBreakdown)
    }
  };
}

// ─── Projects tab ─────────────────────────────────────────────────────────

export async function getWorkspaceProjects(workspaceId) {
  return workspaceContext.run({ workspaceId }, async () => {
    const boards = await Board.find({ isDeleted: false })
      .select('name status priority visibility owner members startDate dueDate lastActivityAt createdAt isArchived')
      .populate('owner', 'name email avatar')
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean();

    const now = Date.now();
    let overdue = 0;
    const statusCounts = { planning: 0, 'in-progress': 0, completed: 0, 'on-hold': 0 };
    const projects = boards.map((b) => {
      const isOverdue = !!b.dueDate && new Date(b.dueDate).getTime() < now && b.status !== 'completed' && !b.isArchived;
      if (isOverdue) overdue++;
      if (b.status in statusCounts) statusCounts[b.status]++;
      return { ...b, isOverdue };
    });

    return {
      projects,
      stats: {
        total: projects.length,
        archived: projects.filter((p) => p.isArchived).length,
        overdue,
        ...statusCounts
      }
    };
  });
}

// ─── Usage tab ─────────────────────────────────────────────────────────────

export async function getWorkspaceUsage(workspaceId) {
  const [memberCount, activeMemberCount, subscription] = await Promise.all([
    WorkspaceMembership.countDocuments({ workspace: workspaceId, status: { $ne: 'removed' } }),
    WorkspaceMembership.countDocuments({ workspace: workspaceId, status: 'active' }),
    WorkspaceSubscription.findOne({ workspace: workspaceId }).populate('plan').lean()
  ]);

  const { projectCount, attachmentBytes, legacyBoardAttachmentBytes, legacyCardAttachmentBytes } = await workspaceContext.run(
    { workspaceId },
    async () => {
      const Card = (await import('../../models/Card.js')).default;
      const [projectCountResult, attachmentAgg, legacyBoardAgg, legacyCardAgg] = await Promise.all([
        Board.countDocuments({ isDeleted: false }),
        Attachment.aggregate([{ $match: { isDeleted: false } }, { $group: { _id: null, total: { $sum: '$fileSize' } } }]),
        // Cheap at single-workspace scope, unlike the platform-wide overview
        // (see getOverviewStats' storage note) — reconciled here for accuracy.
        Board.aggregate([
          { $match: { isDeleted: false } },
          { $unwind: { path: '$attachments', preserveNullAndEmptyArrays: true } },
          { $group: { _id: null, total: { $sum: { $ifNull: ['$attachments.size', 0] } } } }
        ]),
        Card.aggregate([
          { $unwind: { path: '$attachments', preserveNullAndEmptyArrays: true } },
          { $group: { _id: null, total: { $sum: { $ifNull: ['$attachments.size', 0] } } } }
        ])
      ]);
      return {
        projectCount: projectCountResult,
        attachmentBytes: attachmentAgg[0]?.total || 0,
        legacyBoardAttachmentBytes: legacyBoardAgg[0]?.total || 0,
        legacyCardAttachmentBytes: legacyCardAgg[0]?.total || 0
      };
    }
  );

  const totalBytes = attachmentBytes + legacyBoardAttachmentBytes + legacyCardAttachmentBytes;
  const plan = subscription?.plan || null;

  return {
    // "current" is the count actual limit-enforcement compares against
    // (active + suspended, i.e. everyone not removed) — see
    // entitlementService.js#assertCanAddMembers/assertMemberCountFitsPlan,
    // which both count the same way. "total" duplicates it for backward
    // compatibility with any existing caller.
    members: { current: memberCount, total: memberCount, limit: resolveMemberLimit(plan, subscription) },
    projects: { current: projectCount, limit: plan?.projectLimit ?? null },
    storage: {
      attachmentBytes,
      legacyBoardAttachmentBytes,
      legacyCardAttachmentBytes,
      totalBytes,
      limitBytes: plan?.storageLimitBytes ?? null,
      note: 'legacyBoard/CardAttachmentBytes come from embedded pre-Attachment-collection uploads'
    }
  };
}

// ─── Activity tab ──────────────────────────────────────────────────────────

export async function getWorkspaceActivity(workspaceId) {
  return workspaceContext.run({ workspaceId }, async () => {
    const activity = await Activity.find({})
      .populate('user', 'name email avatar')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return {
      activity,
      note: 'Recent activity only — this source retains 90 days of history, not a durable full history.'
    };
  });
}
