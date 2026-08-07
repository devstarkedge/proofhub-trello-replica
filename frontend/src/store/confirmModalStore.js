import { create } from 'zustand';

/**
 * Imperative, promise-based confirmation modal — one instance mounted once
 * (see App.jsx) and driven from anywhere via useConfirmPermissionChange().
 * This is what makes "one centralized modal for every permission change"
 * actually true: callers never render their own dialog, they just await a
 * Promise<boolean> from the single mounted instance.
 */
const useConfirmModalStore = create((set, get) => ({
  isOpen: false,
  details: null,
  resolver: null,

  request: (details) => {
    // If something is already pending, resolve it false before replacing —
    // never leave a caller's promise hanging.
    const { resolver } = get();
    if (resolver) resolver(false);

    return new Promise((resolve) => {
      set({ isOpen: true, details, resolver: resolve });
    });
  },

  resolve: (result) => {
    const { resolver } = get();
    set({ isOpen: false, details: null, resolver: null });
    resolver?.(result);
  }
}));

export default useConfirmModalStore;
