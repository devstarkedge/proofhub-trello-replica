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

// Routes through the centralized Invite Member service's role-less bulk
// method — the standalone POST /:id/invite endpoint this used to call was
// retired (hardcoded admin-only check, no audit logging). Same signature
// and return shape as before; neither caller (CreateWorkspaceWizard,
// WorkspaceOnboardingChecklist) inspects individual result items, so no
// changes were needed there.
export const inviteWorkspaceMembers = async (workspaceId, emails) => {
  const { data } = await api.post(`/api/workspaces/${workspaceId}/invite-member`, {
    method: 'bulk_simple',
    emails
  });
  return data?.data || [];
};

export const getWorkspaceSetupStatus = async (workspaceId) => {
  const { data } = await api.get(`/api/workspaces/${workspaceId}/setup-status`);
  return data?.data;
};
