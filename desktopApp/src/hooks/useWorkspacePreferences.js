import { useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { toast } from 'react-toastify';
import AuthContext from '../context/AuthContext';
import WorkspaceContext from '../context/WorkspaceContext';
import Database from '../services/database';
import { getWorkspacePreferenceSession } from '../services/workspacePreferences';

export default function useWorkspacePreferences() {
  const { user, token } = useContext(AuthContext);
  const { currentWorkspace } = useContext(WorkspaceContext);
  const userId = user?._id || user?.id;
  const workspaceId = currentWorkspace?._id;
  const session = useMemo(() => {
    let storage;
    try { storage = window.localStorage; } catch { /* denied storage */ }
    return getWorkspacePreferenceSession({
      userId, workspaceId,
      storage: userId && workspaceId ? storage : null,
      api: userId && workspaceId ? Database.createWorkspacePreferenceClient(workspaceId, token) : { read: async () => ({}), save: async () => ({}) },
      onError: message => toast.warn(message, { toastId: `preferences:${userId}:${workspaceId}` }),
    });
  }, [userId, workspaceId, token]);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useEffect(() => {
    if (!userId || !workspaceId) return;
    const disconnect = session.connect();
    let lastFocusReconcile = Date.now();
    const refresh = () => { void session.reconcile(); };
    const onFocus = () => {
      const now = Date.now();
      if (now - lastFocusReconcile < 15000) return;
      lastFocusReconcile = now;
      void session.reconcile();
    };
    window.addEventListener('online', refresh);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', onFocus);
      disconnect();
    };
  }, [session, userId, workspaceId]);
  return { ...state, updatePreferences: session.update, retryPreferences: session.reconcile, scopeKey: `${userId}:${workspaceId}` };
}
