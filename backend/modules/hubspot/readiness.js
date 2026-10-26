import { HUBSPOT_MODELS } from './models.js';
import { SyncError } from './domain.js';

let verifiedUntil = 0;
export async function assertHubSpotIndexes() {
  if (verifiedUntil > Date.now()) return;
  try {
    for (const model of HUBSPOT_MODELS) {
      const required = model.schema.indexes().filter(([, options]) => options.unique);
      if (!required.length) continue;
      const indexes = await model.collection.indexes();
      for (const [key] of required) {
        if (!indexes.some(index => index.unique && JSON.stringify(index.key) === JSON.stringify(key))) throw new Error('Missing unique index');
      }
    }
    verifiedUntil = Date.now() + 30_000;
  } catch {
    throw new SyncError('MIGRATION_REQUIRED', 'HubSpot database indexes are not ready. An operator must run the pending database migration.', { status: 503 });
  }
}
