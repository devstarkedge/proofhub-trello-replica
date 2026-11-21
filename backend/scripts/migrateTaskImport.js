import TaskImport from '../models/TaskImport.js';
import Card from '../models/Card.js';

export async function runTaskImportMigration() {
  await TaskImport.createIndexes();
  // Reuse the existing creation-id constraint, without rebuilding other indexes
  // or changing any historical task records.
  await Card.collection.createIndex({ workspaceId: 1, createdBy: 1, trackingCreationId: 1 }, { unique: true, partialFilterExpression: { trackingCreationId: { $type: 'string' } } });
  return { indexes: true, backfill: false };
}
