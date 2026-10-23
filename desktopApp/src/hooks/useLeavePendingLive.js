import { useContext, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AuthContext from '../context/AuthContext';
import WorkspaceContext from '../context/WorkspaceContext';
import { getPendingCount } from '../services/leaveApi';
import { LEAVE_SCOPE_REFRESH_EVENTS, subscribeLeaveRefresh } from '../utils/leaveRequestSync';

export default function useLeavePendingLive() {
  const { user } = useContext(AuthContext);
  const { currentWorkspace } = useContext(WorkspaceContext);
  const client = useQueryClient();
  const [revision, setRevision] = useState(0);
  const workspaceId = currentWorkspace?._id;
  const userId = user?._id || user?.id;
  const enabled = Boolean(workspaceId && userId && ['admin', 'manager', 'hr'].includes(user?.role));
  const queryKey = ['leave-pending-count', workspaceId, userId, revision];
  const read = useQuery({ queryKey, enabled, queryFn: async ({ signal }) =>
    (await getPendingCount({}, { workspaceId, signal, silentError: true })).data,
    staleTime: 30000, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  useEffect(() => {
    if (!enabled) return;
    return subscribeLeaveRefresh({ workspaceId,
      onInvalidate: (event) => {
        if (LEAVE_SCOPE_REFRESH_EVENTS.includes(event.type)) {
          client.cancelQueries({ queryKey: ['leave-pending-count', workspaceId, userId] });
          client.removeQueries({ queryKey: ['leave-pending-count', workspaceId, userId] });
          setRevision((value) => value + 1);
        }
      },
      refresh: () => client.invalidateQueries({ queryKey: ['leave-pending-count', workspaceId, userId] })
    });
  }, [client, enabled, workspaceId, userId]);
  return enabled && !read.isError ? read.data?.count || 0 : 0;
}
