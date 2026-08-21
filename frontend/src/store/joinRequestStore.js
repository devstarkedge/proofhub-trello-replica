import { create } from 'zustand';
import { registerResettable } from './resetRegistry';
import { listJoinRequests } from '../services/memberInvitationApi';

/**
 * Workspace-scoped pending Join Requests — backs both the Sidebar's live
 * badge and the Approval Dashboard's list, so they always agree (one fetch,
 * one set of socket handlers, one source of truth). See
 * hooks/useJoinRequestsLive.js for the gating (permission + active
 * workspace) and socket subscription that drive this store.
 */
const useJoinRequestStore = create((set) => ({
  requests: [],
  pendingCount: 0,
  loading: false,
  error: null,

  load: async (workspaceId) => {
    if (!workspaceId) return [];
    set({ loading: true, error: null });
    try {
      const data = await listJoinRequests(workspaceId, 'pending');
      set({ requests: data, pendingCount: data.length, loading: false });
      return data;
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  // Called after this tab's own approve/reject API call succeeds — splices
  // the item out immediately rather than waiting for the socket echo of the
  // very same event this action just caused server-side.
  removeRequest: (requestId) => {
    set((state) => {
      const requests = state.requests.filter((r) => r._id !== requestId);
      return { requests, pendingCount: requests.length };
    });
  },

  // A request was just submitted for the currently active workspace —
  // payload.workspaceId is compared by the caller (useJoinRequestsLive)
  // before this is invoked, so it only ever runs for the workspace the
  // viewer is actually looking at.
  applyCreated: (payload) => {
    const { request, pendingCount } = payload || {};
    if (!request?._id) return;
    set((state) => {
      if (state.requests.some((r) => r._id === request._id)) return state;
      const requests = [request, ...state.requests];
      return { requests, pendingCount: pendingCount ?? requests.length };
    });
  },

  // A request (in the active workspace) was approved/rejected — by this
  // tab or another admin/tab entirely; either way, drop it from the list.
  applyResolved: (payload) => {
    const { requestId, pendingCount } = payload || {};
    set((state) => {
      const requests = state.requests.filter((r) => r._id !== requestId);
      return { requests, pendingCount: pendingCount ?? requests.length };
    });
  },

  reset: () => set({ requests: [], pendingCount: 0, loading: false, error: null }),
}));

registerResettable(() => useJoinRequestStore.getState().reset());

export default useJoinRequestStore;
