import Delivery from '../services/chat/LeaveReportingDelivery.js';
export async function runLeaveReportingMigration() {
  await Delivery.createIndexes();
  return { additive: true, collection: Delivery.collection.name };
}
