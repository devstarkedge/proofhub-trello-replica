import { actorFromToken } from './offlineQueue.mjs';

// Durable intent outbox. Mongo receipts own persistence after acceptance; IndexedDB
// retains each intent until its outcome is known, including across renderer restarts.
export function createMovementQueue({ openDB, storage, submit, receipts, notify = () => {}, online = () => globalThis.navigator?.onLine !== false, schedule = setTimeout, cancel = clearTimeout }) {
  let running, timer, connection;
  const observedPending = new Set();
  const waiters = new Map();
  const scope = () => `${actorFromToken(storage.getItem('token') || '')}:${storage.getItem('workspaceId') || ''}`;
  const db = () => connection ||= openDB('flowtask-movements', 1, { upgrade(database) {
    database.createObjectStore('moves', { keyPath: 'operationId' });
    database.createObjectStore('leases');
  } }).catch(error => { connection = null; throw error; });
  const active = row => !['APPLIED', 'FAILED', 'SUPERSEDED'].includes(row.status);
  function wake(ms = 150) { cancel(timer); timer = schedule(() => { void process().catch(() => wake(5000)); }, ms); timer?.unref?.(); }
  function settle(row) {
    const waiter = waiters.get(row.operationId);
    if (!waiter || active(row)) return;
    waiters.delete(row.operationId);
    if (row.status === 'FAILED') waiter.reject(Object.assign(new Error(row.error || 'Movement could not be saved. Refresh and retry.'), { status: row.errorStatus }));
    else waiter.resolve(row.status === 'SUPERSEDED' ? { success: true, superseded: true } : { success: true, data: row.data });
    notify({ ...row, type: 'settled' });
  }
  async function pending(boardId) {
    const identity = scope();
    const rows = (await (await db()).getAll('moves')).filter(row => row.scope === identity && (!boardId || row.boardId === boardId) && active(row)).sort((a,b) => a.createdAt - b.createdAt);
    for (const row of rows) observedPending.add(row.operationId);
    return rows;
  }
  function enqueue(input) {
    const identity = scope(), operationId = crypto.randomUUID();
    let resolve, reject;
    const result = new Promise((yes,no) => { resolve = yes; reject = no; });
    // Callers may serialize outcome handling; attach a handler immediately.
    result.catch(() => {});
    waiters.set(operationId, { resolve, reject });
    void (async () => {
      if (!identity.split(':').every(Boolean)) throw new Error('Sign in to save card movements');
      const database = await db(), transaction = database.transaction('moves', 'readwrite');
      const rows = await transaction.store.getAll();
      if (identity !== scope()) { await transaction.done; throw new Error('Account or workspace changed'); }
      if (rows.filter(row => row.scope === identity && active(row)).length >= 500) { await transaction.done; throw new Error('Too many movements are waiting to sync. Reconnect before moving more cards.'); }
      let revision = input.expectedMovementRevision || 0;
      const superseded = [];
      for (const row of rows) {
        if (!active(row) && Date.now() - row.createdAt > 7 * 86400000) await transaction.store.delete(row.operationId);
        if (row.scope !== identity || row.cardId !== input.cardId) continue;
        if (row.status === 'FAILED') { row.dismissed=true; await transaction.store.put(row); }
        if (row.status === 'APPLIED') revision = Math.max(revision, row.data?.movementRevision || 0);
        if (row.status === 'LOCAL') { row.status = 'SUPERSEDED'; await transaction.store.put(row); superseded.push(row); }
      }
      const row = { ...input, expectedMovementRevision: revision, operationId, scope: identity, status: 'LOCAL', createdAt: Date.now(), attempts: 0, retryAt: 0 };
      await transaction.store.put(row); await transaction.done;
      for (const previous of superseded) settle(previous);
      notify({ type: 'queued', ...row }); wake();
    })().catch(error => { waiters.delete(operationId); reject(error); });
    return result;
  }
  async function apply(database, updates, identity) {
    const transaction = database.transaction('moves','readwrite');
    const settled = [];
    for (const receipt of updates) {
      const row = await transaction.store.get(receipt.operationId);
      if (!row || row.scope !== identity) continue;
      Object.assign(row, { status: receipt.status, data: receipt.data, error: receipt.error, errorStatus: receipt.errorStatus, retryAt: 0 });
      await transaction.store.put(row);
      if (row.status === 'APPLIED') {
        for (const next of await transaction.store.getAll()) {
          if (next.scope === identity && next.cardId === row.cardId && next.status === 'LOCAL') {
            next.expectedMovementRevision = Math.max(next.expectedMovementRevision, row.data.movementRevision);
            await transaction.store.put(next);
          }
        }
      }
      settled.push(row);
    }
    await transaction.done;
    if (scope() === identity) for (const row of settled) { settle(row); if (!active(row)) { observedPending.delete(row.operationId); notify({ ...row, type: 'reconciled' }); } }
  }
  async function drain() {
    const database = await db(), identity = scope();
    if (!identity.split(':').every(Boolean)) return;
    for (const row of await database.getAll('moves')) if (row.scope === identity) {
      settle(row);
      if (!active(row) && observedPending.delete(row.operationId)) notify({ ...row, type: 'reconciled' });
    }
    if (!online()) return;
    const owner = crypto.randomUUID(), lease = database.transaction('leases','readwrite');
    if ((await lease.store.get('drain'))?.until > Date.now()) { await lease.done; wake(1000); return; }
    await lease.store.put({ owner, until: Date.now() + 45000 }, 'drain'); await lease.done;
    try {
      const rows = await pending();
      if (scope() !== identity) return;
      const accepted = rows.filter(row => ['QUEUED','PROCESSING'].includes(row.status));
      if (accepted.length) {
        const batch=accepted.slice(0,50), found=await receipts(batch.map(row=>row.operationId));
        await apply(database,found,identity);
        // A receipt may have expired while this renderer was closed. Re-submit
        // the same ID/revision; never invent success for a missing receipt.
        const ids=new Set(found.map(row=>row.operationId));
        for(const row of batch)if(!ids.has(row.operationId)){row.status='SENDING';await database.put('moves',row);}
      }
      if (scope() !== identity) return;
      const claim = database.transaction('moves','readwrite');
      const fresh = (await claim.store.getAll()).filter(row=>row.scope===identity && active(row)).sort((a,b)=>a.createdAt-b.createdAt), selected = [], cards = new Set();
      // Preserve board ordering; a later intent for the same card waits for CAS.
      for (const row of fresh) {
        if (cards.has(row.cardId)) continue;
        cards.add(row.cardId);
        if (['LOCAL','SENDING'].includes(row.status) && row.retryAt <= Date.now()) { row.status='SENDING'; await claim.store.put(row); selected.push(row); }
        if (selected.length === 20) break;
      }
      await claim.done;
      if (scope() !== identity) return;
      if (selected.length) {
        try {
          const updates = await submit(selected.map(({operationId,cardId,destinationListId,position,expectedMovementRevision}) => ({operationId,cardId,destinationListId,position,expectedMovementRevision})));
          await apply(database, updates, identity);
        } catch (error) {
          const status = error.response?.status || error.status;
          for (const row of selected) {
            if (status && status < 500 && ![401,408,429].includes(status)) {
              await apply(database,[{operationId:row.operationId,status:'FAILED',error:error.response?.data?.message || error.message,errorStatus:status}],identity);
            } else { row.attempts++; row.retryAt = Date.now() + Math.min(30000, 500 * 2 ** Math.min(row.attempts,6)); await database.put('moves',row); }
          }
        }
      }
    } finally {
      const release = database.transaction('leases','readwrite');
      if ((await release.store.get('drain'))?.owner === owner) await release.store.delete('drain');
      await release.done;
      if (scope() === identity && (await pending()).length) wake(1000);
    }
  }
  function process() { if (!running) running = drain().finally(() => { running = null; }); return running; }
  return { enqueue, pending, process, wake, detach() { observedPending.clear(); for(const waiter of waiters.values()) waiter.reject(new DOMException('Account or workspace changed; pending movements remain saved for that account.','AbortError'));waiters.clear(); }, async failures(boardId) { return (await (await db()).getAll('moves')).filter(row=>row.scope===scope()&&row.boardId===boardId&&row.status==='FAILED'&&!row.dismissed); }, async dismissFailures(boardId) { const database=await db();for(const row of await database.getAll('moves'))if(row.scope===scope()&&row.boardId===boardId&&row.status==='FAILED'){row.dismissed=true;await database.put('moves',row);}notify({type:'updated'}); } };
}
