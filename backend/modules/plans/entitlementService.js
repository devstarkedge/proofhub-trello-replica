import Workspace from '../../models/Workspace.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import WorkspaceSubscription from '../../models/WorkspaceSubscription.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

/**
 * Single place that decides "what is this workspace's actual member cap",
 * given its plan + subscription row — the one function every screen and
 * every enforcement check reads through, so the number is always the same
 * everywhere (Super Admin table, workspace details, Usage, Plan & Billing,
 * invite/add-member validation).
 *
 * Free/Pro always use the shared, global Plan.memberLimit (10/20) — every
 * workspace on that tier has the same cap, no per-workspace override.
 * Enterprise has NO global limit; each Enterprise workspace's cap is
 * whatever the Super Admin configured for THAT workspace specifically
 * (WorkspaceSubscription.customMemberLimit) — two Enterprise workspaces can
 * have completely different limits. Returns null only when an Enterprise
 * workspace genuinely has not been configured yet — this must never be
 * displayed or treated as "Unlimited", only as "not configured".
 */
export function resolveMemberLimit(plan, subscription) {
  if (!plan) return 10; // no subscription row at all — fail closed to Free's limit
  if (plan.slug === 'enterprise') return subscription?.customMemberLimit ?? null;
  return plan.memberLimit;
}

/**
 * Single source of truth for "what can this workspace do on its current
 * plan" — every member-limit check and every Open Chat gate reads through
 * here instead of re-deriving Plan/WorkspaceSubscription logic inline.
 *
 * No subscription row found → fail CLOSED to the most restrictive real tier
 * (Free, chat disabled), never to unlimited. A missing row should only ever
 * happen for a brief window right after workspace creation (before
 * createDefaultSubscription/createSubscriptionForNewWorkspace lands) or on a
 * pre-migration workspace — neither case should silently grant more than
 * Free gets.
 */
export async function getEntitlements(workspaceId, { session } = {}) {
  const subscription = await WorkspaceSubscription.findOne({ workspace: workspaceId })
    .populate('plan')
    .session(session ?? null);

  if (!subscription?.plan) {
    return { planSlug: 'free', planName: 'Free', memberLimit: 10, chatEnabled: false, subscription: null };
  }

  const planSlug = subscription.plan.slug;
  return {
    planSlug,
    planName: subscription.plan.name,
    memberLimit: resolveMemberLimit(subscription.plan, subscription),
    chatEnabled: planSlug !== 'free',
    subscription,
  };
}

/**
 * Server-side enforcement of "1 real user can CREATE only 1 workspace" —
 * called by every workspace-creation entry point. Pass `session` to
 * participate in the caller's transaction (required for the in-transaction
 * recheck inside workspaceCreation.js#createWorkspaceCore, which closes the
 * double-submit race window this same-shaped standalone call can't).
 */
export async function assertOwnerCanCreateWorkspace(ownerId, { session } = {}) {
  const existing = await Workspace.findOne({ owner: ownerId }).session(session ?? null).lean();
  if (existing) {
    throw new ErrorResponse(
      'You already own a workspace. You can join other workspaces, but each account can create only one workspace.',
      409
    );
  }
}

const MEMBER_LIMIT_MESSAGES = {
  free: 'Your Free workspace has reached its 10-member limit. Upgrade to Pro to add more members and unlock ChatApp.',
  pro: 'Your Pro workspace has reached its 20-member limit. Contact us if your team needs a larger plan.',
};

function memberLimitMessage(planSlug, limit) {
  return MEMBER_LIMIT_MESSAGES[planSlug] || `This workspace has reached its ${limit}-member limit.`;
}

/**
 * Race-safe "is there room for `addCount` more members" check — MUST run
 * inside an active `session.withTransaction()` callback alongside the
 * membership insert/restore that follows it.
 *
 * Why the $inc: MongoDB transactions use snapshot isolation, so two
 * concurrent transactions each adding a DIFFERENT new member never touch the
 * same document and the driver has nothing to conflict on — both could read
 * count=9 against limit=10 and both proceed (classic write-skew), landing at
 * 11. Forcing a write to Workspace.membershipOpLock (same document, shared by
 * every membership-add for this workspace) before counting makes two
 * concurrent adds contend on that one document instead: MongoDB aborts the
 * loser with a TransientTransactionError, which `session.withTransaction()`
 * already retries automatically (the same idiom this codebase already uses
 * for createWorkspace/registerAndCreateWorkspace/acceptInvitation) — the
 * retry re-runs this whole check against the now-committed count, so
 * correctness holds under concurrent load with no reserve/rollback
 * bookkeeping and no denormalized member-count field to keep in sync.
 */
export async function assertCanAddMembers(workspaceId, { session, addCount = 1 } = {}) {
  if (!session) {
    throw new Error('entitlementService.assertCanAddMembers must run inside an active transaction session');
  }

  const { planSlug, memberLimit } = await getEntitlements(workspaceId, { session });

  // Force a write-conflict against any concurrent membership-add transaction
  // on this same workspace — see doc comment above.
  await Workspace.updateOne({ _id: workspaceId }, { $inc: { membershipOpLock: 1 } }).session(session);

  if (memberLimit == null) {
    return { planSlug, memberLimit, currentCount: null };
  }

  const currentCount = await WorkspaceMembership.countDocuments({
    workspace: workspaceId,
    status: { $ne: 'removed' },
  }).session(session);

  if (currentCount + addCount > memberLimit) {
    const err = new ErrorResponse(memberLimitMessage(planSlug, memberLimit), 403);
    err.entitlementViolation = { type: 'member_limit', planSlug, memberLimit, currentCount };
    throw err;
  }

  return { planSlug, memberLimit, currentCount };
}

/**
 * Fires the Free-plan "you hit your member limit" owner email exactly once
 * per limit-hit — idempotent via a findOneAndUpdate that only claims when
 * `planLimitNotifiedAt` is still null, so a second (or hundredth) rejection
 * for the same still-over-limit workspace is a no-op. Cleared back to null on
 * any plan change (subscriptionService.js#changeSubscription) or once the
 * active member count drops back under the plan's limit (see the two
 * member-removal sites in workspaceController.js), so a future genuine
 * limit-hit can notify again.
 *
 * Called from a call site's catch block AFTER its transaction has already
 * rolled back — never from inside assertCanAddMembers itself, since nothing
 * written inside an aborted transaction would durably persist.
 */
export async function notifyFreeLimitReachedIfNeeded(workspaceId, err) {
  if (err?.entitlementViolation?.type !== 'member_limit' || err.entitlementViolation.planSlug !== 'free') {
    return;
  }

  try {
    const claimed = await Workspace.findOneAndUpdate(
      { _id: workspaceId, planLimitNotifiedAt: null },
      { $set: { planLimitNotifiedAt: new Date() } }
    );
    if (!claimed) return; // already notified for this limit-hit — this is what prevents spam

    const workspace = await Workspace.findById(workspaceId).populate('owner', 'name email').lean();
    if (!workspace?.owner?.email) return;

    const currentCount = await WorkspaceMembership.countDocuments({
      workspace: workspaceId,
      status: { $ne: 'removed' },
    });

    const { sendFreeLimitReachedEmail } = await import('../../utils/email.js');
    await sendFreeLimitReachedEmail(workspace.owner, {
      workspaceName: workspace.name,
      currentCount,
      limit: err.entitlementViolation.memberLimit,
    });
  } catch (notifyErr) {
    logger.error('Failed to send free-plan limit-reached email', {
      error: notifyErr.message, workspaceId: String(workspaceId),
    });
  }
}

/**
 * Clears the limit-reached notification flag once a workspace is no longer
 * over its plan's limit (member removed, or upgraded) so a future genuine
 * limit-hit can notify the owner again. Safe/no-op if already null.
 */
export async function clearLimitNotificationIfUnderLimit(workspaceId) {
  try {
    const workspace = await Workspace.findById(workspaceId).select('planLimitNotifiedAt').lean();
    if (!workspace?.planLimitNotifiedAt) return;

    const { memberLimit } = await getEntitlements(workspaceId);
    const currentCount = await WorkspaceMembership.countDocuments({
      workspace: workspaceId,
      status: { $ne: 'removed' },
    });
    if (memberLimit == null || currentCount < memberLimit) {
      await Workspace.updateOne({ _id: workspaceId }, { $set: { planLimitNotifiedAt: null } });
    }
  } catch (err) {
    logger.error('Failed to clear free-plan limit notification flag', {
      error: err.message, workspaceId: String(workspaceId),
    });
  }
}

/**
 * Reusable "does this workspace's current member count fit inside the
 * target plan's limit" guard — used wherever a plan CHANGE (not creation)
 * needs downgrade protection. `targetPlan` must be a Plan document/lean
 * object with at least `{name, slug, memberLimit}`.
 *
 * `actionVerb` only changes the wording, never the logic, so each call
 * site can phrase the rejection appropriately (Super Admin's arbitrary
 * "change this workspace to X" vs. a more specific "downgrade to X")
 * without duplicating the count-and-compare logic itself.
 *
 * `targetMemberLimit`, when explicitly passed (including `null`), is used
 * INSTEAD of `targetPlan.memberLimit` — required for Enterprise, whose real
 * cap lives on the destination WorkspaceSubscription.customMemberLimit, not
 * on the shared Plan document (see resolveMemberLimit above). Omit it for
 * Free/Pro, where `targetPlan.memberLimit` is already correct.
 */
export async function assertMemberCountFitsPlan(workspaceId, targetPlan, { actionVerb = 'change this workspace to', targetMemberLimit } = {}) {
  const limit = targetMemberLimit !== undefined ? targetMemberLimit : targetPlan.memberLimit;
  if (limit == null) return; // no configured cap — always fits (Enterprise not yet configured, or genuinely unlimited)

  const currentCount = await WorkspaceMembership.countDocuments({
    workspace: workspaceId,
    status: { $ne: 'removed' },
  });

  if (currentCount > limit) {
    const err = new ErrorResponse(
      `Cannot ${actionVerb} ${targetPlan.name} because it currently has ${currentCount} members. The ${targetPlan.name} plan supports a maximum of ${limit} members.`,
      400
    );
    err.entitlementViolation = {
      type: 'member_limit_exceeded',
      targetPlanSlug: targetPlan.slug,
      memberLimit: limit,
      currentCount,
    };
    throw err;
  }
}

/**
 * Fans a plan change out to every active member's personal Socket.IO room —
 * mirrors workspaceController.js#emitWorkspaceIconUpdated's exact shape, so
 * a workspace owner sees "Open Chat" appear the instant they upgrade,
 * without a logout/login.
 */
export async function notifyWorkspacePlanUpdated(workspaceId, { planSlug, planName, memberLimit, chatEnabled }) {
  try {
    const { emitToUser } = await import('../../realtime/index.js');
    const memberIds = await WorkspaceMembership.find({ workspace: workspaceId, status: 'active' }).distinct('user');
    for (const userId of memberIds) {
      emitToUser(userId.toString(), 'workspace-plan-updated', {
        workspaceId: workspaceId.toString(), planSlug, planName, memberLimit, chatEnabled,
      });
    }
  } catch (err) {
    logger.error('Failed to emit workspace-plan-updated:', { error: err.message, workspaceId: String(workspaceId) });
  }
}

export default {
  resolveMemberLimit,
  getEntitlements,
  assertOwnerCanCreateWorkspace,
  assertCanAddMembers,
  assertMemberCountFitsPlan,
  notifyFreeLimitReachedIfNeeded,
  clearLimitNotificationIfUnderLimit,
  notifyWorkspacePlanUpdated,
};
