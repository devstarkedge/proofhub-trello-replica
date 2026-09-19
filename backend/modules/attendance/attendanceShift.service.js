import AttendanceShift from './attendanceShift.model.js';
import AttendanceShiftAssignment from './attendanceShiftAssignment.model.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';

export async function listShifts({ workspaceId, includeInactive = false }) {
  const filter = { workspaceId };
  if (!includeInactive) filter.isActive = true;
  return AttendanceShift.find(filter).sort({ name: 1 }).lean();
}

export async function createShift({ workspaceId, name, startLocalTime, endLocalTime, breakMinutes, graceMinutes, minimumFullDayMinutes, minimumHalfDayMinutes, isDefault, createdBy }) {
  if (!name?.trim()) throw new ErrorResponse('Shift name is required', 400);
  if (!startLocalTime || !endLocalTime) throw new ErrorResponse('Start and end time are required', 400);
  return AttendanceShift.create({
    workspaceId, name, startLocalTime, endLocalTime, breakMinutes, graceMinutes, minimumFullDayMinutes,
    minimumHalfDayMinutes, isDefault: Boolean(isDefault), createdBy
  });
}

export async function updateShift({ workspaceId, shiftId, updates }) {
  const shift = await AttendanceShift.findOne({ _id: shiftId, workspaceId });
  if (!shift) throw new ErrorResponse('Shift not found', 404);

  const allowed = ['name', 'startLocalTime', 'endLocalTime', 'breakMinutes', 'graceMinutes', 'minimumFullDayMinutes', 'minimumHalfDayMinutes', 'isDefault', 'isActive'];
  for (const key of allowed) {
    if (updates[key] !== undefined) shift[key] = updates[key];
  }
  await shift.save();
  return shift;
}

export async function deactivateShift({ workspaceId, shiftId }) {
  const shift = await AttendanceShift.findOneAndUpdate({ _id: shiftId, workspaceId }, { $set: { isActive: false } }, { new: true });
  if (!shift) throw new ErrorResponse('Shift not found', 404);
  return shift;
}

export async function listShiftAssignments({ workspaceId }) {
  return AttendanceShiftAssignment.find({ workspaceId, isActive: true }).populate('shift', 'name startLocalTime endLocalTime').sort({ scope: 1 }).lean();
}

/** scope='workspace' has no scopeRef; 'department'/'user' require one. Multiple assignments may exist — resolution precedence lives in attendanceShiftResolver.service.js. */
export async function createShiftAssignment({ workspaceId, shiftId, scope, scopeRef = null, priority = 0, effectiveFrom, effectiveUntil = null, createdBy }) {
  const shift = await AttendanceShift.findOne({ _id: shiftId, workspaceId, isActive: true });
  if (!shift) throw new ErrorResponse('Shift not found or inactive', 404);
  if (scope !== 'workspace' && !scopeRef) throw new ErrorResponse('scopeRef is required for a department or user assignment', 400);

  return AttendanceShiftAssignment.create({
    workspaceId, shift: shiftId, scope, scopeRef: scope === 'workspace' ? null : scopeRef,
    priority, effectiveFrom: effectiveFrom || new Date(), effectiveUntil, isActive: true, createdBy
  });
}

export async function removeShiftAssignment({ workspaceId, assignmentId }) {
  const assignment = await AttendanceShiftAssignment.findOneAndUpdate(
    { _id: assignmentId, workspaceId }, { $set: { isActive: false } }, { new: true }
  );
  if (!assignment) throw new ErrorResponse('Shift assignment not found', 404);
  return assignment;
}
