import { normalizePreferences } from '../../../shared/projectView.mjs';

export const preferenceCacheKey = (userId, workspaceId) => `flowtask:preferences:v1:${userId}:${workspaceId}`;

// A serialized, coalescing write queue shared by every preference in a scope.
// Dependencies are injected so storage/network failures can be exercised directly.
export function createPreferenceSession({ userId, workspaceId, api, storage, onError = console.error, delay = 350 }) {
  const key = preferenceCacheKey(userId, workspaceId);
  let cached;
  try { cached = JSON.parse(storage?.getItem(key) || 'null'); } catch { /* malformed/unavailable cache */ }
  let preferences = normalizePreferences(cached?.version === 1 ? cached.preferences : null);
  let pending = {};
  if (cached?.version === 1 && cached.pending && typeof cached.pending === 'object') {
    for (const field of ['departmentOrder', 'projectSort']) {
      if (Object.hasOwn(cached.pending, field) && JSON.stringify(cached.pending[field]) === JSON.stringify(preferences[field])) pending[field] = preferences[field];
    }
  }
  let snapshot = { preferences, saving: false, error: null };
  const listeners = new Set();
  let timer, running, readController, revision = 0, retryCount = 0, closed = false;
  const emit = patch => {
    snapshot = { ...snapshot, preferences, ...patch };
    listeners.forEach(listener => listener());
  };
  const cache = () => {
    try { storage?.setItem(key, JSON.stringify({ version: 1, preferences, pending })); } catch { /* local storage is optional */ }
  };
  const schedule = (wait = delay) => {
    clearTimeout(timer);
    timer = setTimeout(() => { void flush(); }, wait);
  };
  async function flush() {
    clearTimeout(timer);
    if (running || !Object.keys(pending).length) return running;
    const sent = { ...pending };
    emit({ saving: true });
    let succeeded = false;
    running = (async () => {
      try {
        await api.save(sent);
        // New edits to the same field survive an older acknowledgement.
        for (const field of Object.keys(sent)) {
          if (JSON.stringify(pending[field]) === JSON.stringify(sent[field])) delete pending[field];
        }
        retryCount = 0;
        succeeded = true;
        cache();
        emit({ error: null });
      } catch (error) {
        console.error('Workspace preference save failed:', error);
        if (!closed && !snapshot.error) onError('Your current layout is still available. We will retry syncing it.');
        emit({ error: 'Could not sync your preferences.' });
        if (!closed && retryCount < 3) schedule(1000 * 2 ** retryCount++);
      } finally {
        running = null;
        emit({ saving: false });
        if (succeeded && Object.keys(pending).length) schedule(closed ? 0 : delay);
      }
    })();
    return running;
  }
  async function reconcile() {
    if (closed) return;
    retryCount = 0;
    if (Object.keys(pending).length) {
      await flush();
      if (Object.keys(pending).length || closed) return;
    }
    if (readController) return;
    const controller = new AbortController();
    readController = controller;
    const startedAt = revision;
    try {
      const server = await api.read(controller.signal);
      // A slow bootstrap/focus response cannot overwrite an intervening drag/save.
      if (!closed && !controller.signal.aborted && revision === startedAt) {
        preferences = normalizePreferences(server);
        cache();
        emit({ error: null });
      }
    } catch (error) {
      if (error.name !== 'AbortError' && !closed) {
        console.error('Workspace preference load failed:', error);
        emit({ error: 'Could not load saved preferences. Your current layout is available.' });
      }
    } finally {
      if (readController === controller) readController = null;
    }
  }
  return {
    getSnapshot: () => snapshot,
    hasPending: () => !!running || Object.keys(pending).length > 0,
    setApi: nextApi => { api = nextApi; },
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    update(patch) {
      if (closed) return;
      const normalized = normalizePreferences({ ...preferences, ...patch });
      let changed = false;
      for (const field of ['departmentOrder', 'projectSort']) {
        if (Object.hasOwn(patch, field) && JSON.stringify(normalized[field]) !== JSON.stringify(preferences[field])) {
          pending[field] = normalized[field];
          changed = true;
        }
      }
      if (!changed) return;
      revision++;
      preferences = normalized;
      cache();
      emit({ error: null });
      schedule();
    },
    reconcile,
    flush,
    start() { closed = false; void reconcile(); },
    close() {
      closed = true;
      readController?.abort();
      readController = null;
      clearTimeout(timer);
      // Finish an already authorized edit even if the user navigates away.
      // The adapter retains this session's credentials and workspace header.
      void flush();
    },
  };
}

// Reuse an in-flight queue across navigation and across consumers in one
// user/workspace. Otherwise an old page's delayed save could race a new page.
const sessions = new Map();
export function getWorkspacePreferenceSession(options) {
  const key = preferenceCacheKey(options.userId, options.workspaceId);
  let entry = sessions.get(key);
  if (entry) {
    entry.session.setApi(options.api);
    return entry.session;
  }
  const session = createPreferenceSession(options);
  entry = { session, consumers: 0 };
  sessions.set(key, entry);
  const cleanup = () => {
    if (!entry.consumers && !session.hasPending() && sessions.get(key) === entry) {
      sessions.delete(key);
      unsubscribe();
    }
  };
  const unsubscribe = session.subscribe(cleanup);
  session.connect = () => {
    sessions.set(key, entry);
    entry.consumers++;
    if (entry.consumers === 1) session.start();
    return () => {
      if (--entry.consumers === 0) { session.close(); cleanup(); }
    };
  };
  return session;
}
