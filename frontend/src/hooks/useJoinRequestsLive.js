import { useContext, useEffect } from 'react';
import { toast } from 'react-toastify';
import WorkspaceContext from '../context/WorkspaceContext';
import usePermissions from './usePermissions';
import useJoinRequestStore from '../store/joinRequestStore';

/**
 * Keeps the Join Requests store live for the currently active workspace:
 * fetches on mount/workspace switch, then applies JOIN_REQUEST_* socket
 * events as they arrive — no polling, no manual refresh needed. Gated on
 * canApproveJoinRequests so a member without the permission never issues
 * the (server-enforced-anyway) list request and never renders a badge.
 *
 * Safe to call from multiple components at once (Sidebar badge +
 * JoinRequestsPage) — every handler sets state from the server's payload
 * rather than incrementing a local counter, so re-subscribing is idempotent.
 */
const useJoinRequestsLive = () => {
  const { currentWorkspace } = useContext(WorkspaceContext);
  const { can } = usePermissions();
  const workspaceId = currentWorkspace?._id || null;
  const enabled = !!workspaceId && can('canApproveJoinRequests');

  const requests = useJoinRequestStore((state) => state.requests);
  const pendingCount = useJoinRequestStore((state) => state.pendingCount);
  const loading = useJoinRequestStore((state) => state.loading);
  const load = useJoinRequestStore((state) => state.load);
  const removeRequest = useJoinRequestStore((state) => state.removeRequest);
  const applyCreated = useJoinRequestStore((state) => state.applyCreated);
  const applyResolved = useJoinRequestStore((state) => state.applyResolved);

  useEffect(() => {
    if (!enabled) return;
    // store.load() rethrows so an explicit refresh() call can detect
    // failure — this effect only fires it in the background, so it must
    // swallow the rejection itself or it surfaces as an unhandled rejection.
    load(workspaceId).catch(() => {
      toast.error('Failed to load join requests');
    });
  }, [enabled, workspaceId, load]);

  useEffect(() => {
    if (!enabled) return undefined;

    // The server only ever targets this event at approvers of the workspace
    // the socket authenticated under (see joinRequestService.js), which — by
    // construction of socketService.switchWorkspace's full reconnect — is
    // always this tab's currentWorkspace. The workspaceId check here is a
    // client-side belt-and-suspenders against a stale event arriving right
    // as a workspace switch is in flight, not a security boundary.
    const handleCreated = (event) => {
      const payload = event.detail || {};
      if (payload.workspaceId === workspaceId) applyCreated(payload);
    };
    const handleResolved = (event) => {
      const payload = event.detail || {};
      if (payload.workspaceId === workspaceId) applyResolved(payload);
    };

    window.addEventListener('socket-join-request-created', handleCreated);
    window.addEventListener('socket-join-request-approved', handleResolved);
    window.addEventListener('socket-join-request-rejected', handleResolved);

    return () => {
      window.removeEventListener('socket-join-request-created', handleCreated);
      window.removeEventListener('socket-join-request-approved', handleResolved);
      window.removeEventListener('socket-join-request-rejected', handleResolved);
    };
  }, [enabled, workspaceId, applyCreated, applyResolved]);

  return {
    requests: enabled ? requests : [],
    pendingCount: enabled ? pendingCount : 0,
    loading,
    removeRequest,
    refresh: () => load(workspaceId),
  };
};

export default useJoinRequestsLive;
