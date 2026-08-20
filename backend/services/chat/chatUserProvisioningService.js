import crypto from 'crypto';
import User from '../../models/User.js';

/**
 * Find-or-create a FlowTask User for a ChatApp-originated workspace
 * creator, who may have no prior FlowTask account (e.g. a ChatApp-native
 * user who registered directly in ChatApp, never touched FlowTask).
 * Mirrors ChatApp's own userRepository.upsertFromFlowTask, reversed.
 *
 * FlowTask's User schema requires a real password (no passwordless/SSO
 * provisioning pattern exists anywhere else in the codebase — register(),
 * registerAndCreateWorkspace(), and memberInvitationController#inviteMemberDirect
 * all require one supplied via request body). The password generated here
 * is never used for login: this user continues authenticating via
 * ChatApp's own session. There is no reverse "ChatApp JWT -> FlowTask
 * login" handshake and this plan does not build one.
 *
 * @param {{name?: string, email: string, avatar?: string}} creator
 * @returns {Promise<object>} the FlowTask User document (existing or newly created)
 */
export async function upsertFromChatApp({ name, email, avatar } = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error('upsertFromChatApp: email is required');
  }

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    // Reuse the existing identity as-is — never silently mutate an
    // existing FlowTask user's role/department just because ChatApp sent
    // a workspace-creation event referencing their email.
    return existing;
  }

  return User.create({
    name: name || normalizedEmail,
    email: normalizedEmail,
    password: crypto.randomBytes(32).toString('hex'),
    isVerified: true,
    role: 'employee',
    avatar: avatar || '',
  });
}

export default { upsertFromChatApp };
