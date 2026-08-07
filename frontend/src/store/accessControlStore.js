import { create } from 'zustand';
import * as accessControlApi from '../services/accessControlApi';

/**
 * Zustand store for the centralized Access & Permissions engine.
 *
 * Holds the current user's fully-resolved effective permissions (one object
 * covering every resource — Sales, Finance, Access Control delegation — plus
 * the role checklist and HR Panel access scope) and the permission registry
 * used to render permission pickers. This is the single client-side source
 * of truth every component should read from instead of re-deriving
 * `user.role === 'admin'` locally or fetching a resource's permissions itself.
 */
const useAccessControlStore = create((set, get) => ({
  myPermissions: null, // { role, isAdmin, resources: {sales:{...}, finance:{...}, access_control:{...}}, roleChecklist, accessScope, canManageAccessControl }
  registry: null, // { resources: { sales: {label, actions:[...]}, finance: {...}, access_control: {...} } }
  loading: false,
  error: null,

  loadMyPermissions: async () => {
    try {
      set({ loading: true, error: null });
      const data = await accessControlApi.getMyEffectivePermissions();
      set({ myPermissions: data, loading: false });
      return data;
    } catch (error) {
      console.error('Error loading effective permissions:', error);
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  loadRegistry: async () => {
    try {
      const data = await accessControlApi.getRegistry();
      set({ registry: data });
      return data;
    } catch (error) {
      console.error('Error loading permission registry:', error);
      throw error;
    }
  },

  /** Does the current user have resource.action? Admin always true. */
  can: (resource, action) => {
    const { myPermissions } = get();
    if (!myPermissions) return false;
    if (myPermissions.isAdmin) return true;
    return myPermissions.resources?.[resource]?.[action] === true;
  },

  canAny: (resource, ...actions) => {
    const { can } = get();
    return actions.some((action) => can(resource, action));
  },

  canManageAccessControl: () => {
    const { myPermissions } = get();
    return Boolean(myPermissions?.canManageAccessControl);
  },

  refresh: async () => {
    await Promise.all([get().loadMyPermissions(), get().loadRegistry()]);
  },

  reset: () => set({ myPermissions: null, registry: null, loading: false, error: null })
}));

export default useAccessControlStore;
