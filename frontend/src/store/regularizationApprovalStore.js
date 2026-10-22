import { create } from 'zustand';
import { toast } from 'react-toastify';
import { registerResettable } from './resetRegistry';
import * as attendanceApi from '../services/attendanceApi';

/**
 * Workspace-scoped pending Regularization Requests approval queue.
 * Backs the live badge on Sidebar ("Attendance"), AttendanceLayout ("Approvals" tab),
 * and AttendanceApprovalsPage with optimistic UI updates.
 */
const useRegularizationApprovalStore = create((set, get) => ({
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

  restoreApproval: (approval, index) => {
    set((state) => {
      if (state.queue.some((item) => String(item._id) === String(approval._id))) return state;
      const queue = [...state.queue];
      if (typeof index === 'number' && index >= 0 && index <= queue.length) {
        queue.splice(index, 0, approval);
      } else {
        queue.unshift(approval);
      }
      return { queue, pendingCount: queue.length };
    });
  },

  /**
   * Optimistic decision handler:
   * 1. Immediately removes the item from the queue and updates all badges (0ms UI latency).
   * 2. Runs the API call in the background.
   * 3. Automatically rolls back and shows an error toast if the network call fails.
   */
  decideOptimistic: (approval, decision) => {
    const approvalId = approval._id;
    const state = get();
    const previousQueue = state.queue;
    const index = previousQueue.findIndex((item) => String(item._id) === String(approvalId));

    // 1. Immediately remove from UI
    state.removeApproval(approvalId);

    // 2. Perform API call in background
    attendanceApi
      .decideRegularizationApproval(approvalId, decision)
      .then(() => {
        window.dispatchEvent(new CustomEvent('attendance-regularization-refresh'));
      })
      .catch((error) => {
        // Rollback on background failure
        get().restoreApproval(approval, index);
        toast.error(error?.response?.data?.message || error?.message || `Failed to ${decision.toLowerCase()} request`);
      });
  },

  reset: () => set({ queue: [], pendingCount: 0, loading: false, error: null }),
}));

registerResettable(() => useRegularizationApprovalStore.getState().reset());

export default useRegularizationApprovalStore;
