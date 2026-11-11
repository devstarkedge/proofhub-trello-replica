import { useSyncExternalStore } from 'react';
const empty = Object.freeze({ enabled: false, phase: 'disabled' });
let state = empty;
const listeners = new Set();
function publish(value) {
  state = value;
  listeners.forEach(listener => listener());
}
export function applyUpdateStatus(value) {
  if (value && !(state.revision >= value.revision)) publish(value);
}
export const useDesktopUpdates = () => useSyncExternalStore(callback => { listeners.add(callback); return () => listeners.delete(callback); }, () => state);
async function updateAction(action) {
  const revision = state.revision;
  if (action === 'restart') publish({ ...state, restartSubmitting: true, actionError: '' });
  else if (state.actionError) publish({ ...state, actionError: '' });
  try {
    const updates = window.flowtaskDesktop?.updates;
    if (typeof updates?.[action] !== 'function') throw new Error('Update bridge unavailable');
    applyUpdateStatus(await updates[action]());
  } catch {
    if (state.revision === revision) {
      publish({ ...state, actionError: 'FlowTask could not confirm that action. Try again.' });
    }
  } finally {
    if (action === 'restart' && state.revision === revision && state.restartSubmitting) {
      publish({ ...state, restartSubmitting: false });
    }
  }
}
export const checkDesktopUpdates = () => updateAction('check');
export const canRequestRestart = state => state.phase === 'downloaded' && !state.restartSubmitting && !(state.restartPending && state.restartMode === 'now');
export const restartDesktopUpdate = () => canRequestRestart(state) && updateAction('restart');
export const postponeDesktopUpdate = () => updateAction('later');
export const cancelDesktopUpdate = () => updateAction('cancel');

export const restartSteps = [
  { id: 'requested', label: 'Restart requested' },
  { id: 'waiting', label: 'Waiting for a safe restart' },
  { id: 'preparing', label: 'Saving activity and preparing update' },
  { id: 'restarting', label: 'Restarting to install' },
];

export function updateStatusText(state) {
  if (state.restartSubmitting) return 'Requesting restart…';
  if (state.restartStage === 'failed') return 'Could not restart to update';
  if (state.restartStage === 'restarting' && state.restartOnExit) return 'Closing to install';
  const step = restartSteps.find(({ id }) => id === state.restartStage);
  if (step) return step.label;
  return {
    idle: 'Check for updates', checking: 'Checking for updates…', 'up-to-date': 'FlowTask is up to date',
    available: 'Update available', downloading: `Downloading update · ${Math.round(state.progress || 0)}%`,
    downloaded: 'Update ready to install', error: 'Update failed · Retry', disabled: 'Updates unavailable in development',
  }[state.phase] || 'Check for updates';
}
