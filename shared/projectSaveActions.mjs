import { captureRequestScope, requestScopeKey } from './requestScope.mjs';

// One owner per project submission, independent of the edit drawer's lifetime.
export function createProjectSaveActions({ storage, update, confirmed, toast }) {
  const pending = new Map(), failedToasts = new Map(), listeners = new Set();
  let revision = 0;
  const scope = () => requestScopeKey(captureRequestScope(storage));
  const notify = () => listeners.forEach(listener => listener());
  const keyFor = projectId => `${scope()}:${projectId}`;
  return {
    isPending: projectId => pending.has(keyFor(projectId)),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    invalidate() {
      revision++;
      for (const entry of pending.values()) toast.dismiss(entry.toastId);
      for (const toastId of failedToasts.values()) toast.dismiss(toastId);
      failedToasts.clear();
    },
    start({ projectId, updates, draftKey, draft }) {
      const key = keyFor(projectId);
      if (pending.has(key)) return pending.get(key).task;
      // Keep a recoverable, identity-scoped draft before releasing the drawer.
      const savedDraft = JSON.stringify({ formData:draft, savedAt:new Date().toISOString() });
      storage.setItem(draftKey, savedDraft);
      if (failedToasts.has(key)) { toast.dismiss(failedToasts.get(key)); failedToasts.delete(key); }
      const identity = scope(), generation = revision;
      const current = () => identity === scope() && generation === revision;
      const entry = { toastId:toast.loading('Moving project… Saving in the background.'), task:null };
      entry.task = Promise.resolve().then(() => update(projectId, updates)).then(response => {
        if (!current()) return;
        if (!response.success || String(response.data?._id || response.data?.id) !== String(projectId)) throw new Error('The project move could not be confirmed. Reopen the project and retry.');
        confirmed(response.data);
        if (storage.getItem(draftKey) === savedDraft) storage.removeItem(draftKey);
        toast.update(entry.toastId, { render:'Project moved successfully.', type:'success', isLoading:false, autoClose:4000, closeButton:true });
        return response.data;
      }).catch(error => {
        if (current()) {
          failedToasts.set(key, entry.toastId);
          toast.update(entry.toastId, {
          render:`${error.message || 'The project move could not be confirmed.'} Your selections are saved; reopen Edit Project to review and retry.`,
          type:'error', isLoading:false, autoClose:false, closeButton:true
          });
        }
      }).finally(() => {
        if (!current()) toast.dismiss(entry.toastId);
        if (pending.get(key) === entry) pending.delete(key);
        notify();
      });
      pending.set(key, entry);
      notify();
      return entry.task;
    }
  };
}
