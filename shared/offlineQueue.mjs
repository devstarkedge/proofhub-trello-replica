const STORE = 'mutations';
const MAX_AGE = 7 * 86400000;
const sensitiveKey = /password|token|secret|credential|authorization/i;
export function hasSensitiveFields(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, nested]) => key !== 'colorToken' && sensitiveKey.test(key) || hasSensitiveFields(nested));
}
export function shouldQueueOfflineRequest(config) {
  if (!config || config.skipOfflineQueue || !['post', 'put', 'patch', 'delete'].includes(config.method?.toLowerCase())) return false;
  if (/\/api\/(auth|super-admin|integrations|hubspot)(\/|$)/i.test(config.url || '')) return false;
  try {
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    return (!body || typeof body === 'object' && Object.getPrototypeOf(body) === Object.prototype) && !hasSensitiveFields(body);
  } catch { return false; }
}
export function actorFromToken(token) {
  try {
    const body = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return String(JSON.parse(atob(body)).id || '');
  } catch { return ''; }
}
export function createOfflineQueue({ openDB, storage, fetch: send = globalThis.fetch, origin, notify = () => {} }) {
  let running;
  const database = () => openDB('flowtask-sync', 3, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { autoIncrement: true, keyPath: 'id' });
      // Legacy entries contain raw bearer tokens and cannot be attributed safely.
      if (oldVersion > 0 && oldVersion < 3) transaction.objectStore(STORE).clear();
      if (!db.objectStoreNames.contains('leases')) db.createObjectStore('leases');
    }
  });
  const identity = () => ({ userId: actorFromToken(storage.getItem('token') || ''), workspaceId: storage.getItem('workspaceId') || '' });
  const getMutations = async () => (await database()).getAll(STORE);
  const deleteMutation = async key => (await database()).delete(STORE, key);
  async function addMutation(input) {
    const config = { method: input.method, url: input.url, data: input.body };
    if (!shouldQueueOfflineRequest(config)) throw new Error('This request cannot be saved offline');
    const actor = identity();
    if (!actor.userId || !actor.workspaceId) throw new Error('A signed-in workspace is required');
    if (input.actorId && input.actorId !== actor.userId || input.workspaceId && input.workspaceId !== actor.workspaceId) throw new Error('The account or workspace changed before this edit could be saved');
    const url = new URL(input.url, new URL(input.baseURL || origin, origin)).href;
    if (new URL(url).origin !== new URL(input.baseURL || origin, origin).origin) throw new Error('Invalid offline destination');
    const body = typeof input.body === 'string' ? input.body : JSON.stringify(input.body);
    if ((body || '').length > 1024 * 1024) throw new Error('Offline request is too large');
    await (await database()).add(STORE, { ...actor, url, method: input.method, body, timestamp: Date.now(), mutationId: crypto.randomUUID(), state: 'pending' });
    notify({ type: 'queued' });
  }
  async function replay() {
    const db = await database();
    const owner = crypto.randomUUID();
    const lease = db.transaction('leases', 'readwrite');
    const previous = await lease.store.get('replay');
    if (previous?.expiresAt > Date.now()) { await lease.done; return; }
    await lease.store.put({ owner, expiresAt: Date.now() + 60000 }, 'replay');
    await lease.done;
    try {
      const actor = identity();
      if (!actor.userId || !actor.workspaceId) return;
      for (const mutation of await getMutations()) {
        if (mutation.userId !== actor.userId || mutation.workspaceId !== actor.workspaceId || mutation.state === 'conflict') continue;
        if (Date.now() - mutation.timestamp > MAX_AGE) {
          await db.put(STORE, { ...mutation, state: 'conflict', status: 410 });
          notify({ type: 'conflict', id: mutation.id, status: 410 });
          continue;
        }
        const current = identity();
        if (current.userId !== actor.userId || current.workspaceId !== actor.workspaceId) break;
        await db.put('leases', { owner, expiresAt: Date.now() + 60000 }, 'replay');
        try {
          const response = await send(mutation.url, {
            method: mutation.method, body: mutation.body, signal: AbortSignal.timeout(15000),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${storage.getItem('token')}`, 'x-workspace-id': actor.workspaceId, 'x-offline-mutation-id': mutation.mutationId }
          });
          if (response.ok) await deleteMutation(mutation.id);
          else if (response.status === 401 || response.status >= 500 || response.status === 429) break;
          else {
            await db.put(STORE, { ...mutation, state: 'conflict', status: response.status });
            notify({ type: 'conflict', id: mutation.id, status: response.status });
          }
        } catch { break; }
      }
    } finally {
      const release = db.transaction('leases', 'readwrite');
      if ((await release.store.get('replay'))?.owner === owner) await release.store.delete('replay');
      await release.done;
    }
    notify({ type: 'updated' });
  }
  function processMutations() {
    if (!running) running = replay().finally(() => { running = null; });
    return running;
  }
  return { addMutation, getMutations, deleteMutation, processMutations };
}
