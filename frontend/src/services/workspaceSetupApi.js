import api from './api';

/**
 * Workspace-creation-adjacent client: slug availability, member invites, and
 * setup/onboarding status. Split out from WorkspaceContext and
 * workspaceMembersApi (member-management on an already-open workspace)
 * since these calls are specific to creation and post-creation onboarding.
 */

export const checkSlugAvailability = async (slug) => {
  const { data } = await api.get('/api/workspaces/check-slug', { params: { slug } });
  return data?.data;
};

export const inviteWorkspaceMembers = async (workspaceId, emails) => {
  const { data } = await api.post(`/api/workspaces/${workspaceId}/invite`, { emails });
  return data?.data || [];
};

export const getWorkspaceSetupStatus = async (workspaceId) => {
  const { data } = await api.get(`/api/workspaces/${workspaceId}/setup-status`);
  return data?.data;
};
