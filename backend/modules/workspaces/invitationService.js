import crypto from 'crypto';
import WorkspaceInvitation from '../../models/WorkspaceInvitation.js';
import User from '../../models/User.js';
import Workspace from '../../models/Workspace.js';
import { createOrRestoreMembership } from './membershipCreation.js';
import { createJoinRequestFromInvitation } from './joinRequestService.js';
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
 * Single-use: a second accept attempt on the same token will fail
 * findValidInvitationByToken's status==='pending' check.
 */
export async function acceptInvitation(invitation, userId) {
  if (invitation.requiresApproval) {
    const joinRequest = await createJoinRequestFromInvitation(invitation, userId);

    invitation.status = 'accepted';
    invitation.acceptedAt = new Date();
    invitation.acceptedBy = userId;
    await invitation.save();

    return { outcome: 'pending_approval', joinRequest };
  }

  const { outcome, membership } = await createOrRestoreMembership({
    workspaceId: invitation.workspace,
    userId,
    role: invitation.role,
    roleId: invitation.roleId,
    invitedBy: invitation.invitedBy,
    department: invitation.requestedDepartment || []
  });

  invitation.status = 'accepted';
  invitation.acceptedAt = new Date();
  invitation.acceptedBy = userId;
  await invitation.save();

  // Notify the inviter — only for a genuine new/returning join, never for
  // the already-a-member case (avoids a duplicate notification if this
  // token is ever raced/double-submitted). Notification.create needs
  // ambient workspace context that isn't guaranteed at every caller of this
  // function (authController's register() runs it from a public,
  // unauthenticated route with no ambient context at all) — re-establish it
  // here, same as joinRequestService.js#createJoinRequestFromInvitation.
  if (invitation.invitedBy && outcome !== 'already_member') {
    try {
      await workspaceContext.run({ workspaceId: invitation.workspace }, async () => {
        const [newMember, workspace] = await Promise.all([
          User.findById(userId).select('name').lean(),
          workspaceContext.runUnscoped(() => Workspace.findById(invitation.workspace).select('name').lean())
        ]);
        if (newMember) {
          await notificationService.notifyMemberJoined(newMember, invitation.invitedBy, workspace?.name || 'the workspace');
        }
      });
    } catch (err) {
      console.error('Failed to notify inviter of accepted invitation:', err);
    }
  }

  return { outcome, membership };
}

export default { generateToken, hashToken, createOrRefreshInvitation, findValidInvitationByToken, acceptInvitation };
