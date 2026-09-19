import Workspace from '../../models/Workspace.js';

/**
 * Idempotent, Admin/HR-triggered "turn on Attendance for this workspace"
 * action. Unlike Leave's setup (which seeds default leave types and a work
 * calendar), Attendance has nothing safe to pre-seed — the spec is explicit
 * that no policy/shift/location should ever ship with hardcoded example
 * values, and Attendance reuses the Leave module's own Work Calendar via
 * the shared facade rather than creating a second one. So this is just the
 * flag flip; HR configures Policy/Shift/Location afterward via Settings.
 */
export async function setupAttendanceModule({ workspaceId }) {
  await Workspace.updateOne({ _id: workspaceId }, { $set: { attendanceModuleEnabled: true } });
  return { attendanceModuleEnabled: true };
}
