import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as leaveApi from '../services/leaveApi';
import { registerResettable } from './resetRegistry';

const useLeaveStore = create(
  persist(
    (set, get) => ({
      // ─── Server data (never persisted) ───────────────────────────────────
      balances: [],
      myRequests: [],
      approvalQueue: [],
      loading: false,
      error: null,

      // ─── UI preferences (persisted) ──────────────────────────────────────
      calendarViewMode: 'month',
      dashboardTab: 'employee',

      // ─── Fetchers ─────────────────────────────────────────────────────────
      fetchMyBalance: async () => {
        set({ loading: true, error: null });
        try {
          const { data } = await leaveApi.getMyBalance();
          set({ balances: data, loading: false });
          return data;
        } catch (error) {
          set({ loading: false, error: error.message });
          throw error;
        }
      },

      fetchMyRequests: async (status = null) => {
        const { data } = await leaveApi.getMyRequests(status ? { status } : {});
        set({ myRequests: data });
        return data;
      },

      fetchApprovalQueue: async () => {
        const { data } = await leaveApi.getApprovalQueue();
        set({ approvalQueue: data });
        return data;
      },

      submitLeaveRequest: async (payload) => {
        const previous = get().myRequests;
        try {
          const { data } = await leaveApi.submitRequest(payload);
          set({ myRequests: [data.request, ...previous] });
          await get().fetchMyBalance();
          return data;
        } catch (error) {
          set({ myRequests: previous });
          throw error;
        }
      },

      cancelPendingRequest: async (requestId) => {
        const { data } = await leaveApi.cancelPendingRequest(requestId);
        set({
          myRequests: get().myRequests.map((request) => (request._id === requestId ? data.request : request))
        });
        await get().fetchMyBalance();
        return data;
      },

      decideApproval: async (approvalId, decision, comment) => {
        const previous = get().approvalQueue;
        set({ approvalQueue: previous.filter((item) => item._id !== approvalId) });
        try {
          const { data } = await leaveApi.decideApproval(approvalId, decision, comment);
          return data;
        } catch (error) {
          set({ approvalQueue: previous });
          throw error;
        }
      },

      // ─── Realtime socket-bridge handlers (called by page components after
      // subscribing to the matching window CustomEvent — see services/socket.js) ───
      handleRequestCreated: (payload) => {
        if (payload?.request) {
          set({ myRequests: [payload.request, ...get().myRequests] });
        }
      },
      handleRequestUpdated: (payload) => {
        if (!payload?.request) return;
        set({
          myRequests: get().myRequests.map((request) => (request._id === payload.request._id ? payload.request : request))
        });
      },
      handleApprovalUpdated: (payload) => {
        if (!payload?.approval) return;
        set({ approvalQueue: get().approvalQueue.filter((item) => item._id !== payload.approval._id) });
      },
      handleBalanceUpdated: () => {
        get().fetchMyBalance().catch(() => {});
      },

      setCalendarViewMode: (mode) => set({ calendarViewMode: mode }),
      setDashboardTab: (tab) => set({ dashboardTab: tab }),

      reset: () => set({
        balances: [], myRequests: [], approvalQueue: [], loading: false, error: null
      })
    }),
    {
      name: 'leave-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        calendarViewMode: state.calendarViewMode,
        dashboardTab: state.dashboardTab
      })
    }
  )
);

registerResettable(() => useLeaveStore.getState().reset());

export default useLeaveStore;
