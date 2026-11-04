import { LRUCache } from 'lru-cache';
import { TrackingAgenda } from './tracking.models.js';

// Only the existence of the built-in definition is retained. Authorization
// and the actual agenda list remain fresh on every request. LRU fetch also
// coalesces concurrent first reads without growing an unbounded promise map.
const defaults = new LRUCache({
  max: 1000,
  ttl: 6 * 60 * 60 * 1000,
  fetchMethod: async workspaceId => {
    try {
      await TrackingAgenda.findOneAndUpdate({ normalizedTitle: 'learning' },
        { $setOnInsert: { workspaceId, title: 'Learning', normalizedTitle: 'learning' } }, { upsert: true });
    } catch (error) { if (error.code !== 11000) throw error; }
    return true;
  }
});

export const ensureDefaultTrackingAgenda = workspaceId => defaults.fetch(String(workspaceId));
