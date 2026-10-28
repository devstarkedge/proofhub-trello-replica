import { openDB } from 'idb';
import { createOfflineQueue } from '../../../shared/offlineQueue.mjs';

const queue = createOfflineQueue({ openDB, storage: localStorage, origin: window.location.origin,
  notify: detail => window.dispatchEvent(new CustomEvent('offline-sync-status', { detail })) });
export const { addMutation, getMutations, deleteMutation, processMutations } = queue;
