import api from './api';

/**
 * Member-management client for a single workspace. Split out from
 * WorkspaceContext (which owns the switcher-level concerns: the caller's
 * own workspace list, current workspace, create/switch/rename) since these
 * calls are only ever used from WorkspaceSettingsPage, on whichever
 * workspace is currently open.
 */

export const getWorkspaceMembers = async (workspaceId) => {
  const { data } = await api.get(`/api/workspaces/${workspaceId}/members`);
  return data?.data || [];
};

// Adding a member now happens exclusively through the centralized Invite
// Member system (see memberInvitationApi.js) — getAvailableUsers/
// addWorkspaceMember (the old existing-user-picker flow) were removed along
// with AddWorkspaceMemberModal.jsx.

export const updateWorkspaceMemberRole = async (workspaceId, userId, role) => {
  const { data } = await api.patch(`/api/workspaces/${workspaceId}/members/${userId}`, { role });
  return data?.data;
};

export const removeWorkspaceMember = async (workspaceId, userId) => {
  const { data } = await api.delete(`/api/workspaces/${workspaceId}/members/${userId}`);
  return data?.data;
};
