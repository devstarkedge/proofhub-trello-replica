import { useSyncExternalStore } from 'react';
const empty = Object.freeze({ enabled: false, phase: 'disabled' });
let state = empty;
const listeners = new Set();
export const applyUpdateStatus = value => { if (value && state.revision > value.revision) return; state = value || empty; listeners.forEach(listener => listener()); };
export const useDesktopUpdates = () => useSyncExternalStore(callback => { listeners.add(callback); return () => listeners.delete(callback); }, () => state);
const updateAction = action => Promise.resolve().then(() => {
  const updates = window.flowtaskDesktop?.updates;
  if (typeof updates?.[action] !== 'function') throw new Error('Update bridge unavailable');
  return updates[action]();
}).then(applyUpdateStatus).catch(() => applyUpdateStatus({ ...state, phase: state.version ? 'downloaded' : 'error', dismissed: false, manual: true, restartPending: false, message: 'The update action could not reach the desktop app. Your update is saved. Save changes and fully close/reopen FlowTask, then retry.' }));
export const checkDesktopUpdates = () => updateAction('check');
export const restartDesktopUpdate = () => updateAction('restart');
export const postponeDesktopUpdate = () => updateAction('later');
export const cancelDesktopUpdate = () => updateAction('cancel');
export const updateStatusText = state => ({ idle: 'Check for updates', checking: 'Checking for updates…', 'up-to-date': 'FlowTask is up to date', available: 'Update available', downloading: `Downloading update · ${Math.round(state.progress || 0)}%`, downloaded: state.restartPending ? 'Update waiting for a safe restart' : 'Update ready to install', installing: 'Preparing safe restart…', error: 'Update failed · Retry', disabled: 'Updates unavailable in development' })[state.phase] || 'Check for updates';
