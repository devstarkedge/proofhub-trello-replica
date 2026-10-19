import { isBackendConnectivityError } from './authErrors.js';

export function createBackendConnectivityMonitor(target = globalThis.window) {
  let unavailable = false;
  return {
    failed(error) {
      if (!isBackendConnectivityError(error) || unavailable) return;
      unavailable = true;
      target?.dispatchEvent(new Event('flowtask:backend-unavailable'));
    },
    succeeded() {
      if (!unavailable) return;
      unavailable = false;
      target?.dispatchEvent(new Event('flowtask:backend-recovered'));
    },
    isUnavailable: () => unavailable,
  };
}
