import { toast } from 'react-toastify';

const pending = new Map();
const listeners = new Set();
const drafts = new Map();
export const isLeaveBackgroundActionPending = (key) => pending.has(key);
export const subscribeLeaveBackgroundActions = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const notifyPending = () => listeners.forEach((listener) => listener());
export const getLeaveDraft = (key) => drafts.get(key);
export const setLeaveDraft = (key, draft) => draft ? drafts.set(key, draft) : drafts.delete(key);
// The operation stays alive after its modal closes. Only a confirmed server
// transaction produces a success message; retries keep their submission ID.
export function runLeaveBackgroundAction({ key, workspaceId, action, pendingMessage, successMessage, onSuccess, onError }) {
  if (pending.has(key)) return pending.get(key);
  const toastId = toast.loading(pendingMessage);
  const task = Promise.resolve().then(action).then((result) => {
    toast.update(toastId, { render: successMessage, type: 'success', isLoading: false, autoClose: 4000, closeButton: true });
    onSuccess?.(result);
    return result;
  }).catch((error) => {
    toast.update(toastId, { render: error.response?.data?.message || error.message || 'The leave action could not be confirmed. Refresh and retry safely.',
      type: 'error', isLoading: false, autoClose: false, closeButton: true });
    onError?.(error);
  }).finally(() => {
    pending.delete(key);
    notifyPending();
    window.dispatchEvent(new CustomEvent('leave-local-change', { detail: { workspaceId } }));
  });
  pending.set(key, task);
  notifyPending();
  return task;
}
