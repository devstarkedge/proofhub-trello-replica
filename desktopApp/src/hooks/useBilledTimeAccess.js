import { useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import AuthContext from '../context/AuthContext';
import WorkspaceContext from '../context/WorkspaceContext';
import Database from '../services/database';
import useModalHierarchyStore from '../store/modalHierarchyStore';
import { projectIdentity, resolveBilledTimeAccess } from '../utils/projectBilling';

// All task levels share one scoped read. Missing client fields in a lightweight
// board population are a loading state, not an authorization result.
const useBilledTimeAccess = (projectId) => {
  const { user } = useContext(AuthContext);
  const { currentWorkspace } = useContext(WorkspaceContext);
  const cachedProject = useModalHierarchyStore((state) => state.currentProject);
  const id = projectIdentity(projectId), workspaceId = currentWorkspace?._id;
  const userId = user?._id || user?.id;
  const matchingProject = projectIdentity(cachedProject) === id
    && (!cachedProject?.workspaceId || projectIdentity(cachedProject.workspaceId) === String(workspaceId)) ? cachedProject : null;
  const complete = matchingProject && projectIdentity(matchingProject.workspaceId) === String(workspaceId)
    && Object.hasOwn(matchingProject, 'clientDetails')
    && Object.hasOwn(matchingProject, 'billingCycle');
  const details = useQuery({
    queryKey: ['project-billing', workspaceId, userId, id],
    queryFn: async ({ signal }) => {
      const response = await Database.getProject(id, { signal, workspaceId });
      if (!response.success || !response.data) throw new Error('Unable to load project billing settings.');
      return response.data;
    },
    enabled: Boolean(id && workspaceId && userId && !complete),
    staleTime: 30000, gcTime: 60000, retry: false, refetchOnWindowFocus: false
  });
  const project = complete ? matchingProject : details.data;
  const loading = Boolean(id && !project && !details.isError);
  const error = !project && details.isError ? details.error : null;
  return { ...resolveBilledTimeAccess(project, user?.role, { loading, error }),
    project: project || matchingProject, loading, error, retry: details.refetch };
};

export default useBilledTimeAccess;
