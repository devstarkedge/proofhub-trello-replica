import { createScreenshotCache } from '../../../shared/screenshotCache.mjs';
import { registerResettable } from '../store/resetRegistry';
import { getScreenshotBlob } from './trackingApi';

const managers = new WeakMap();
export function screenshotCache(client) {
  if (managers.has(client)) return managers.get(client);
  const images = createScreenshotCache(client, { loadBlob: getScreenshotBlob });
  const listeners = new Set();
  let revision = 0, blocked = false, connected = true, identity = '';
  const notify = () => { revision++; listeners.forEach(fn => fn()); };
  const reset = () => { images.clear(); notify(); };
  const connection = event => {
    connected = event.type === 'socket-connected';
    blocked = !connected;
    reset();
  };
  const manager = {
    images, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    snapshot: () => revision,
    get blocked() { return blocked; },
    identity(value) {
      if (identity && identity !== value) { blocked = !connected; reset(); }
      identity = value;
    }
  };
  managers.set(client, manager);
  // Installed once for the lifetime of QueryClient, including when reports are
  // unmounted but their private images remain in cache.
  registerResettable(reset);
  const changed = event => {
    const { type = '', payload = {} } = event.detail || {};
    if (/role|permission|department|membership|access|authz|workspace.*updated|board.*updated|realtime-recover/.test(type)) { blocked = !connected; reset(); }
    else if (type === 'tracking:screenshot-updated' && payload.screenshotId) {
      images.invalidate(payload.screenshotId, payload);
    }
    if (/^tracking:/.test(type)) client.invalidateQueries({ predicate: query => query.queryKey[0] === 'tracking-private' && ['gallery', 'timeline'].includes(query.queryKey[2]) && (!payload.sessionId || String(query.queryKey[3]) === String(payload.sessionId)) });
  };
  window.addEventListener('flowtask:realtime', changed);
  for (const name of ['socket-disconnected', 'socket-connected', 'socket-auth-expired', 'socket-workspace-rejected']) window.addEventListener(name, connection);
  window.addEventListener('storage', event => { if (['token', 'workspaceId'].includes(event.key) || event.key === null) reset(); });
  client.getQueryCache().subscribe(event => {
    if (event.type !== 'updated' || event.action.type !== 'error' || event.query.queryKey[0] !== 'tracking-private') return;
    if ([401, 403].includes(event.query.state.error?.response?.status) && !blocked) {
      blocked = true;
      images.clear();
      notify();
    }
  });
  return manager;
}
