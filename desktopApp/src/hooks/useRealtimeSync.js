import { createRealtimeInvalidation } from '../../../shared/realtimeInvalidation.mjs';
import { useContext, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import AuthContext from '../context/AuthContext';
import WorkspaceContext from '../context/WorkspaceContext';
import useProjectStore from '../store/projectStore';
import useWorkflowStore from '../store/workflowStore';

// Socket events invalidate authorized reads; they are never permission grants.
export default function useRealtimeSync() {
  const { user } = useContext(AuthContext);
  const { currentWorkspace } = useContext(WorkspaceContext);
  const client = useQueryClient();
  useEffect(() => {
    if (!user || !currentWorkspace?._id) return;
    const coordinator = createRealtimeInvalidation({ workspaceId: currentWorkspace._id,
      workflow: () => useWorkflowStore.getState(), projects: () => useProjectStore.getState(), client,
      notify: detail => window.dispatchEvent(new CustomEvent('flowtask:data-invalidated', { detail })) });
    window.addEventListener('flowtask:realtime', coordinator.changed);
    for (const name of ['socket-connected', 'online', 'desktop-resume']) window.addEventListener(name, coordinator.recover);
    return () => {
      coordinator.dispose();
      window.removeEventListener('flowtask:realtime', coordinator.changed);
      for (const name of ['socket-connected', 'online', 'desktop-resume']) window.removeEventListener(name, coordinator.recover);
    };
  }, [user?._id, currentWorkspace?._id, client]);
}
