import { create } from 'zustand';
import * as accessControlApi from '../services/accessControlApi';
import { registerResettable } from './resetRegistry';

let generation = 0;
let permissionSerial = 0;
let permissionRequest = null;
let registryRequest = null;
let lastRefreshEvent = null;

const useAccessControlStore = create((set, get) => ({
  myPermissions: null,
  registry: null,
  loading: false,
  registryLoading: false,
  error: null,
  registryError: null,

  loadMyPermissions: (force = false) => {
    if (permissionRequest && !force) return permissionRequest;
    const epoch = generation;
    const serial = ++permissionSerial;
    set({ loading: true, error: null });
    const request = accessControlApi.getMyEffectivePermissions().then((data) => {
      if (!data?.resources) throw new Error('Permissions could not be loaded.');
      if (epoch === generation && serial === permissionSerial) set({ myPermissions: data, loading: false });
      return data;
    }).catch((error) => {
      if (epoch === generation && serial === permissionSerial) set({ myPermissions: null, error: error.message, loading: false });
      throw error;
    }).finally(() => { if (permissionRequest === request) permissionRequest = null; });
    permissionRequest = request;
    return request;
  },

  loadRegistry: () => {
    if (registryRequest) return registryRequest;
    const epoch = generation;
    set({ registryLoading: true, registryError: null });
    const request = accessControlApi.getRegistry().then((data) => {
      if (!data?.resources) throw new Error('The permission catalog could not be loaded.');
      if (epoch === generation) set({ registry: data, registryLoading: false });
      return data;
    }).catch((error) => {
      if (epoch === generation) set({ registry: null, registryLoading: false, registryError: error.message });
      throw error;
    }).finally(() => { if (registryRequest === request) registryRequest = null; });
    registryRequest = request;
    return request;
  },

  // The server has already resolved role defaults and explicit overrides.
  can: (resource, action) => get().myPermissions?.resources?.[resource]?.[action] === true,
  canAny: (resource, ...actions) => actions.some((action) => get().can(resource, action)),
  canManageAccessControl: () => Boolean(get().myPermissions?.canManageAccessControl),
  refresh: () => Promise.all([get().loadMyPermissions(true), get().loadRegistry()]),
  refreshAfterEvent: (event) => {
    if (event === lastRefreshEvent) return permissionRequest || Promise.resolve();
    lastRefreshEvent = event;
    return get().loadMyPermissions(true);
  },
  reset: () => {
    generation += 1;
    permissionRequest = null;
    registryRequest = null;
    lastRefreshEvent = null;
    set({ myPermissions: null, registry: null, loading: false, registryLoading: false, error: null, registryError: null });
  }
}));

registerResettable(() => useAccessControlStore.getState().reset());
export default useAccessControlStore;
