import { useContext, useEffect, useCallback } from 'react';
import AuthContext from '../context/AuthContext';
import WorkspaceContext from '../context/WorkspaceContext';
import useRegularizationApprovalStore from '../store/regularizationApprovalStore';

/**
 * Hook to keep pending regularization approval count live for Manager and Admin users.
 * Automatically loads on mount/workspace change and refreshes on socket events.
 */
const useRegularizationApprovalLive = () => {
  const { user } = useContext(AuthContext);
  const { currentWorkspace } = useContext(WorkspaceContext);
  const workspaceId = currentWorkspace?._id || null;

  const role = (user?.role || '').toLowerCase();
  // Manager, Admin (and HR) who can approve regularization requests
  const isApproverRole = ['admin', 'manager', 'hr'].includes(role);
  const enabled = Boolean(user && workspaceId && isApproverRole);

  const queue = useRegularizationApprovalStore((state) => state.queue);
  const pendingCount = useRegularizationApprovalStore((state) => state.pendingCount);
  const loading = useRegularizationApprovalStore((state) => state.loading);
  const load = useRegularizationApprovalStore((state) => state.load);
  const removeApproval = useRegularizationApprovalStore((state) => state.removeApproval);
  const restoreApproval = useRegularizationApprovalStore((state) => state.restoreApproval);
  const decideOptimistic = useRegularizationApprovalStore((state) => state.decideOptimistic);

  const refresh = useCallback(() => {
    if (enabled && workspaceId) {
      return load(workspaceId).catch(() => {});
    }
  }, [enabled, workspaceId, load]);

  useEffect(() => {
    if (!enabled) return;
    load(workspaceId).catch(() => {});
  }, [enabled, workspaceId, load]);

  useEffect(() => {
    if (!enabled) return;

    const handleEvent = () => {
      refresh();
    };

    window.addEventListener('socket-attendance-regularization-requested', handleEvent);
    window.addEventListener('socket-attendance-regularization-decided', handleEvent);
    window.addEventListener('attendance-regularization-refresh', handleEvent);

    return () => {
      window.removeEventListener('socket-attendance-regularization-requested', handleEvent);
      window.removeEventListener('socket-attendance-regularization-decided', handleEvent);
      window.removeEventListener('attendance-regularization-refresh', handleEvent);
    };
  }, [enabled, refresh]);

  return {
    queue: enabled ? queue : [],
    pendingCount: enabled ? pendingCount : 0,
    loading,
    refresh,
    removeApproval,
    restoreApproval,
    decideOptimistic
  };
};

export default useRegularizationApprovalLive;
