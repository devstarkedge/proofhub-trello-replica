import { create } from 'zustand';
import { registerResettable } from './resetRegistry';
import * as attendanceApi from '../services/attendanceApi';

/**
 * Workspace-scoped pending Regularization Requests approval queue.
 * Backs the live badge on Sidebar ("Attendance"), AttendanceLayout ("Approvals" tab),
 * and AttendanceApprovalsPage.
 */
const useRegularizationApprovalStore = create((set) => ({
  queue: [],
  pendingCount: 0,
  loading: false,
  error: null,

  load: async (workspaceId) => {
    if (!workspaceId) {
      set({ queue: [], pendingCount: 0, loading: false, error: null });
      return [];
    }
    set({ loading: true, error: null });
    try {
      const response = await attendanceApi.getRegularizationApprovalQueue();
      const list = Array.isArray(response?.data)
        ? response.data
        : (Array.isArray(response) ? response : []);
      set({ queue: list, pendingCount: list.length, loading: false });
      return list;
    } catch (error) {
      // If 403 or unauthorized, clear count gracefully without breaking UI
      set({ queue: [], pendingCount: 0, loading: false, error: error?.message || null });
      return [];
    }
  },

  removeApproval: (approvalId) => {
    set((state) => {
      const queue = state.queue.filter((item) => String(item._id) !== String(approvalId));
      return { queue, pendingCount: queue.length };
    });
  },

  reset: () => set({ queue: [], pendingCount: 0, loading: false, error: null }),
}));

registerResettable(() => useRegularizationApprovalStore.getState().reset());

export default useRegularizationApprovalStore;
