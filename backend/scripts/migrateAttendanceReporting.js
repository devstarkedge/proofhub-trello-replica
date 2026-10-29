import AttendanceEvent from '../modules/attendance/attendanceEvent.model.js';
import ReportingDirectoryState from '../services/chat/ReportingDirectoryState.js';

export async function runAttendanceReportingMigration() {
  await AttendanceEvent.collection.createIndex({ workspaceId: 1, kind: 1, attendanceSession: 1, processedAt: 1, reportOrder: 1 });
  await ReportingDirectoryState.createIndexes();
  return { reportingIndexesCreated: true, historicalRowsChanged: 0 };
}
