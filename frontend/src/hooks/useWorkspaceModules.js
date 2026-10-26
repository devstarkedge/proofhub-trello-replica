import { useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import WorkspaceContext from '../context/WorkspaceContext';
import { getWorkspaceModules } from '../services/workspaceConfigsApi';

export default function useWorkspaceModules() {
  const { currentWorkspace } = useContext(WorkspaceContext);
  return useQuery({ queryKey: ['workspace-modules', currentWorkspace?._id], queryFn: () => getWorkspaceModules(currentWorkspace._id),
    enabled: !!currentWorkspace?._id, staleTime: 10_000, refetchInterval: 30_000, retry: 1 });
}
