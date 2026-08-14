import crypto from 'crypto';
import mongoose from 'mongoose';
import WorkspaceInvitation from '../../models/WorkspaceInvitation.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import User from '../../models/User.js';
import Workspace from '../../models/Workspace.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { createOrRestoreMembership } from './membershipCreation.js';
import { createJoinRequestRow, notifyAndAuditJoinRequestSubmitted } from './joinRequestService.js';
import { recordAuditLog } from '../permissions/auditLogService.js';
import * as workspaceContext from './workspaceContext.js';
import notificationService from '../../utils/notificationService.js';

const TOKEN_BYTES = 32;
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — long enough for a real invite to be acted on, unlike the 15-minute password-reset link

export const generateToken = () => crypto.randomBytes(TOKEN_BYTES).toString('hex');
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Creates a new pending invitation, or — if one is already pending for this
 * exact (workspace, email) — refreshes its token/expiry/role in place
 * instead of accumulating duplicate rows (this is the "duplicate invitation
 * handling" the re-invite path needs: re-inviting the same still-pending
 * email is a resend, not an error).
 *
 * Returns { invitation, plaintextToken } — plaintextToken only ever exists
 * in memory here and in the outgoing email; only its hash is persisted.
 */
export async function createOrRefreshInvitation({
  workspaceId, email, role, roleId, invitedBy,
  department, personalMessage, requiresApproval = false
}) {
  const plaintextToken = generateToken();
  const tokenHash = hashToken(plaintextToken);
  const expiresAt = new Date(Date.now() + EXPIRY_MS);

  const invitation = await WorkspaceInvitation.findOneAndUpdate(
    { workspace: workspaceId, email, status: 'pending' },
    {
      $set: {
        role, roleId, invitedBy, tokenHash, expiresAt, requiresApproval,
        requestedDepartment: department || [],
        personalMessage: personalMessage || ''
      },
      $setOnInsert: { workspace: workspaceId, email, status: 'pending' }
    },
    { upsert: true, new: true }
  );

  return { invitation, plaintextToken };
}

/**
 * Looks up a raw plaintext token (as received in the URL) and returns the
 * live, still-valid invitation — or null if it doesn't exist, was already
 * used/cancelled, or has expired (an expired-but-still-pending row is
 * flipped to 'expired' here so it stops showing as pending anywhere else,
 * e.g. a re-invite would otherwise "refresh" a row a visitor might still
 * have an old copy of the link for).
 */
export async function findValidInvitationByToken(rawToken) {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);

  const invitation = await WorkspaceInvitation.findOne({ tokenHash }).select('+tokenHash');
  if (!invitation) return null;

  if (invitation.status === 'pending' && invitation.expiresAt < new Date()) {
    invitation.status = 'expired';
    await invitation.save();
    await recordAuditLog({
      actor: null,
      actorEmail: invitation.email,
      action: 'INVITATION_EXPIRED',
      targetType: 'WorkspaceInvitation',
      targetId: invitation._id,
      resourceKey: 'workspace_member',
      resourceLabel: 'Workspace Members',
      summary: `Invitation to ${invitation.email} expired`,
      category: 'workspace_member',
      meta: { workspaceId: invitation.workspace }
    });
    return null;
  }

  if (invitation.status !== 'pending') return null;

  return invitation;
}

/**
 * Redeems a valid invitation for a given user: creates/restores their
 * WorkspaceMembership (see membershipCreation.js — a previously-removed
 * member is restored, not duplicated) and marks the invitation accepted.
 *
 * Takes the invitation's id, not a previously-fetched document — the
 * pending→accepted transition below is a single atomic compare-and-swap
 * (`findOneAndUpdate` filtered on `status:'pending'`), which is what makes
 * this safe against a double-click, two open tabs, or a network retry: only
 * one caller can ever "win" the swap, and the loser is resolved idempotently
 * below rather than allowed to race the winner's membership write. The
 * direct-membership branch runs inside a transaction together with
 * createOrRestoreMembership's own atomic upsert (membershipCreation.js) so
 * the two writes commit or roll back together. The requiresApproval branch
 * is intentionally NOT in that transaction — WorkspaceJoinRequest's own
 * partial unique index `{workspace,user,status:'pending'}` already makes it
 * race-safe on its own.
 */
export async function acceptInvitation(invitationId, userId) {
  const session = await mongoose.startSession();
  let claimed = null;
  let outcome;
  let membership;
  let joinRequest;

  try {
    await session.withTransaction(async () => {
      claimed = await WorkspaceInvitation.findOneAndUpdate(
        { _id: invitationId, status: 'pending' },
        { $set: { status: 'accepted', acceptedAt: new Date(), acceptedBy: userId } },
        { new: false, session } // pre-image — still has role/roleId/department/requiresApproval/invitedBy
      );

      if (!claimed) return; // lost the race, or already used — resolved outside the transaction below

      if (claimed.requiresApproval) {
        joinRequest = await createJoinRequestRow(claimed, userId, session);
        outcome = 'pending_approval';
        return;
      }

      ({ outcome, membership } = await createOrRestoreMembership({
        workspaceId: claimed.workspace,
        userId,
        role: claimed.role,
        roleId: claimed.roleId,
        invitedBy: claimed.invitedBy,
        department: claimed.requestedDepartment || [],
        session
      }));
    });
  } finally {
    await session.endSession();
  }

  if (!claimed) {
    // Same-request retry or a genuine loser of the race — both look
    // identical from here. If a direct-join membership already exists,
    // resolve idempotently (the caller gets the same successful-looking
    // answer the winner got) instead of a confusing error for a request
    // that may have already accomplished exactly what was asked.
    const invitation = await WorkspaceInvitation.findById(invitationId).select('workspace').lean();
    const alreadyActive = invitation && await WorkspaceMembership.findOne({
      workspace: invitation.workspace, user: userId, status: 'active'
    }).lean();
    if (alreadyActive) {
      return { outcome: 'already_member', membership: alreadyActive };
    }
    throw new ErrorResponse(
      'This invitation is no longer valid — it may have already been used, cancelled, or revoked.',
      409
    );
  }

  if (claimed.requiresApproval) {
    await notifyAndAuditJoinRequestSubmitted(joinRequest, claimed);
    return { outcome, joinRequest };
  }

  // Notify + audit the inviter — only for a genuine new/returning join,
  // never for the already-a-member case (avoids a duplicate notification).
  // Notification.create needs ambient workspace context that isn't
  // guaranteed at every caller of this function (authController's
  // register() runs it from a public, unauthenticated route with no
  // ambient context at all) — re-establish it here.
  if (claimed.invitedBy && outcome !== 'already_member') {
    try {
      await workspaceContext.run({ workspaceId: claimed.workspace }, async () => {
        const [newMember, workspace] = await Promise.all([
          User.findById(userId).select('name').lean(),
          workspaceContext.runUnscoped(() => Workspace.findById(claimed.workspace).select('name').lean())
        ]);
        if (newMember) {
          await notificationService.notifyMemberJoined(newMember, claimed.invitedBy, workspace?.name || 'the workspace');
        }
      });
    } catch (err) {
      console.error('Failed to notify inviter of accepted invitation:', err);
    }

    await recordAuditLog({
      actor: { _id: userId },
      action: 'INVITATION_ACCEPTED',
      targetType: 'WorkspaceInvitation',
      targetId: claimed._id,
      resourceKey: 'workspace_member',
      resourceLabel: 'Workspace Members',
      summary: `Invitation to ${claimed.email} was accepted`,
      category: 'workspace_member',
      meta: { workspaceId: claimed.workspace }
    });
  }

  return { outcome, membership };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Workspace-scoped, cursor-paginated invitation list for the Manage
 * Invitations UI. "Expired" is computed live (a still-'pending' row past
 * its expiresAt counts, in addition to rows already flipped by
 * findValidInvitationByToken's lazy check) so the tab is correct without a
 * cron sweep. 'revoked' and 'cancelled' are grouped into one bucket to
 * match the UI's single "Revoked/Cancelled" tab.
 */
export async function listInvitations({ workspaceId, status = 'pending', cursor, limit = 20, search, sort = 'newest' }) {
  const now = new Date();
  const filter = { workspace: workspaceId };

  if (status === 'expired') {
    filter.$or = [{ status: 'expired' }, { status: 'pending', expiresAt: { $lt: now } }];
  } else if (status === 'revoked' || status === 'cancelled') {
    filter.status = { $in: ['revoked', 'cancelled'] };
  } else if (status === 'accepted') {
    filter.status = 'accepted';
  } else {
    filter.status = 'pending';
    filter.expiresAt = { $gte: now };
  }

  if (search && search.trim()) {
    filter.email = { $regex: escapeRegExp(search.trim()), $options: 'i' };
  }

  const sortDir = sort === 'oldest' ? 1 : -1;
  if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
    filter._id = sortDir === -1 ? { $lt: new mongoose.Types.ObjectId(cursor) } : { $gt: new mongoose.Types.ObjectId(cursor) };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  const rows = await WorkspaceInvitation.find(filter)
    .populate('invitedBy', 'name email')
    .populate('roleId', 'name slug')
    .populate('requestedDepartment', 'name')
    .sort({ _id: sortDir })
    .limit(safeLimit + 1)
    .lean();

  const hasMore = rows.length > safeLimit;
  const page = hasMore ? rows.slice(0, safeLimit) : rows;
  const nextCursor = hasMore ? String(page[page.length - 1]._id) : null;

  return { data: page, nextCursor, hasMore };
}

/**
 * Reissues a pending-or-expired invitation: fresh token/hash/expiry,
 * status forced back to 'pending', in the SAME row (preserves invite
 * history/audit trail rather than creating a duplicate). Filtered by
 * workspace as well as id so one workspace's admin can never resend a
 * different workspace's invitation by guessing an id. Compare-and-swap on
 * status, same idempotency shape as acceptInvitation — resending something
 * another tab just had accepted/revoked cleanly 404s instead of racing.
 */
export async function resendInvitation({ invitationId, workspaceId, actor }) {
  const plaintextToken = generateToken();
  const tokenHash = hashToken(plaintextToken);
  const expiresAt = new Date(Date.now() + EXPIRY_MS);

  const invitation = await WorkspaceInvitation.findOneAndUpdate(
    { _id: invitationId, workspace: workspaceId, status: { $in: ['pending', 'expired'] } },
    { $set: { tokenHash, expiresAt, status: 'pending', emailSentAt: null, lastEmailError: null } },
    { new: true }
  );

  if (!invitation) {
    throw new ErrorResponse(
      'This invitation can no longer be resent — it may have already been accepted, revoked, or does not belong to this workspace.',
      404
    );
  }

  await recordAuditLog({
    actor,
    action: 'INVITATION_RESENT',
    targetType: 'WorkspaceInvitation',
    targetId: invitation._id,
    resourceKey: 'workspace_member',
    resourceLabel: 'Workspace Members',
    summary: `${actor?.name || 'Someone'} resent the invitation to ${invitation.email}`,
    category: 'workspace_member',
    meta: { workspaceId }
  });

  return { invitation, plaintextToken };
}

/**
 * Revokes a pending-or-expired invitation — its token immediately stops
 * validating (findValidInvitationByToken only ever matches status:'pending').
 * Workspace-scoped for the same reason as resendInvitation. Compare-and-swap
 * on status so revoking something just accepted elsewhere cleanly 404s.
 */
export async function revokeInvitation({ invitationId, workspaceId, actor }) {
  const invitation = await WorkspaceInvitation.findOneAndUpdate(
    { _id: invitationId, workspace: workspaceId, status: { $in: ['pending', 'expired'] } },
    { $set: { status: 'revoked', revokedAt: new Date(), revokedBy: actor?._id || actor?.id || null } },
    { new: true }
  );

  if (!invitation) {
    throw new ErrorResponse(
      'This invitation can no longer be revoked — it may have already been accepted or does not belong to this workspace.',
      404
    );
  }

  await recordAuditLog({
    actor,
    action: 'INVITATION_REVOKED',
    targetType: 'WorkspaceInvitation',
    targetId: invitation._id,
    resourceKey: 'workspace_member',
    resourceLabel: 'Workspace Members',
    summary: `${actor?.name || 'Someone'} revoked the invitation to ${invitation.email}`,
    category: 'workspace_member',
    meta: { workspaceId }
  });

  return { invitation };
}

/**
 * Best-effort email-dispatch outcome, written after the fact by a
 * fire-and-forget send (see memberInvitationController.js) — deliberately
 * decoupled from invitation creation/resend so an SMTP hiccup never fails
 * the request that already committed the invitation row. Never throws.
 */
export async function recordEmailDispatchOutcome(invitationId, error = null) {
  try {
    if (error) {
      await WorkspaceInvitation.updateOne(
        { _id: invitationId },
        { $set: { lastEmailError: String(error.message || error) } }
      );
    } else {
      await WorkspaceInvitation.updateOne(
        { _id: invitationId },
        { $set: { emailSentAt: new Date(), lastEmailError: null } }
      );
    }
  } catch (err) {
    console.error('Failed to record invitation email dispatch outcome:', err);
  }
}

export default {
  generateToken,
  hashToken,
  createOrRefreshInvitation,
  findValidInvitationByToken,
  acceptInvitation,
  listInvitations,
  resendInvitation,
  revokeInvitation,
  recordEmailDispatchOutcome
};
