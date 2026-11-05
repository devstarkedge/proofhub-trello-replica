import { registerResettable } from '../store/resetRegistry';
import { openDB } from 'idb';
import api from './api';
import { createMovementQueue } from '../../../shared/movementQueue.mjs';
const queue = createMovementQueue({ openDB, storage: localStorage,
  submit: async operations => (await api.post('/api/cards/movements', { operations }, { skipOfflineQueue: true, timeout: 15000 })).data.data,
  receipts: async ids => (await api.get('/api/cards/movements', { params: { ids: ids.join(',') }, timeout: 15000 })).data.data,
  notify: detail => window.dispatchEvent(new CustomEvent('flowtask:movement-status', { detail }))
});
for (const event of ['online', 'socket-connected', 'flowtask:token-updated', 'storage']) window.addEventListener(event, () => queue.wake());
registerResettable(() => queue.detach());
queue.wake();
export default queue;
