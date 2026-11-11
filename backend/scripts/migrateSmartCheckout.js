import AttendanceSession, { activityCheckoutIndex, activityCheckoutIndexOptions } from '../modules/attendance/attendanceSession.model.js';
import AttendanceEvent from '../modules/attendance/attendanceEvent.model.js';
import LeaveRequest from '../modules/leave/leaveRequest.model.js';
export async function runSmartCheckoutMigration(){
  await AttendanceEvent.createIndexes();
  await LeaveRequest.collection.createIndex({workspaceId:1,requester:1,status:1,startDate:1,endDate:1},{name:'leave_attendance_coverage'});
  return {indexesCreated:true,historicalRowsChanged:0};
}

export async function runActivityCheckoutIndexMigration() {
  await AttendanceSession.collection.createIndex(activityCheckoutIndex, activityCheckoutIndexOptions);
  return { indexesCreated: true, historicalRowsChanged: 0 };
}
