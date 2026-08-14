import api from './api';

/**
 * Client for the Manage Invitations panel — listing, resending, and
 * revoking WorkspaceInvitation rows created by any of the centralized
 * Invite Member system's methods (direct/self_register/bulk_simple). See
 * backend/controllers/memberInvitationController.js's
 * listInvitationsHandler/resendInvitationHandler/revokeInvitationHandler.
 */

export const listInvitations = async (workspaceId, { status, cursor, limit, search, sort } = {}) => {
  const { data } = await api.get(`/api/workspaces/${workspaceId}/invitations`, {
    params: { status, cursor, limit, search, sort },
  });
  return data;
};

export const resendInvitation = async (workspaceId, invitationId) => {
  const { data } = await api.patch(`/api/workspaces/${workspaceId}/invitations/${invitationId}/resend`);
  return data?.data;
};

export const revokeInvitation = async (workspaceId, invitationId) => {
  const { data } = await api.patch(`/api/workspaces/${workspaceId}/invitations/${invitationId}/revoke`);
  return data?.data;
};
