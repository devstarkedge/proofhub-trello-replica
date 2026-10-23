import { useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import AuthContext from '../context/AuthContext';
import WorkspaceContext from '../context/WorkspaceContext';
import useLeaveStore from '../store/leaveStore';

// Reuse the app's QueryClient. No persisted records or separate query cache.
export default function useLeaveQuery(resource, params, fetcher, { enabled = true } = {}) {
  const { user } = useContext(AuthContext);
  const { currentWorkspace } = useContext(WorkspaceContext);
  const revision = useLeaveStore((state) => state.accessRevision);
  const readsPaused = useLeaveStore((state) => state.readsPaused);
  const workspaceId = currentWorkspace?._id, userId = user?._id || user?.id;
  return useQuery({
    queryKey: ['leave', workspaceId, userId, revision, resource, params],
    queryFn: async ({ signal }) => (await fetcher(params, { signal, workspaceId })).data,
    enabled: Boolean(enabled && !readsPaused && workspaceId && userId),
    staleTime: 15000,
    gcTime: 60000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    refetchIntervalInBackground: false
  });
}
