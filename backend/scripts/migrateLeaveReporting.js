import Delivery from '../services/chat/LeaveReportingDelivery.js';
import LeaveRequest from '../modules/leave/leaveRequest.model.js';
export async function runLeaveReportingMigration() {
  await Delivery.createIndexes();
  await LeaveRequest.collection.createIndex({ workspaceId: 1, status: 1, endDate: 1, _id: 1 }, { name: 'leave_reporting_due_candidates' });
  return { additive: true, collection: Delivery.collection.name };
}
