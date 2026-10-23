import LeaveRequest, { APPROVED_STATUSES } from '../leave/leaveRequest.model.js';
import LeaveRequestDay from '../leave/leaveRequestDay.model.js';
import mongoose from 'mongoose';

/**
 * Read-only bridge into the Leave module (spec §27-30). Attendance NEVER
 * duplicates Leave's own fields or short-leave duration math — it only
 * reads LeaveRequest/LeaveRequestDay (the exact join `leaveDayStatus.service.js`
 * already uses for the Teams overlay) and translates the result into the
 * shape Attendance's own resolvers need. This service is deliberately
 * policy-agnostic: it reports WHAT Leave says about this date, never
 * whether Attendance should reject a check-in because of it — that
 * decision belongs to the caller, which has the active AttendancePolicyVersion
 * in scope (e.g. `fullDayLeaveCheckInBehavior`).
 */

const NONE_RESULT = Object.freeze({
  leaveState: 'NONE', attendanceExpected: true, presenceFractionCap: 1, leaveFraction: 0,
  leaveTypeName: null, leaveTypeCategory: null, shortLeaveWindow: null
});


/** The approved leave (if any) in effect for this user on this exact business date. `dayInstant` must already be a workspace-tz-midnight instant (dateOnlyToInstant), not a bare `new Date()`. */
export async function resolveLeaveContextForDate({ workspaceId, userId, dayInstant, dbSession = null }) {
  // Join on the authoritative workspace business date. Request date fields may
  // be UTC-midnight labels, which differ from workspace midnight on day one.
  const days = await LeaveRequestDay.aggregate([
    { $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId), date: dayInstant } },
    { $lookup: { from: LeaveRequest.collection.name, localField: 'request', foreignField: '_id', pipeline: [
      { $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId), requester: new mongoose.Types.ObjectId(userId), status: { $in: APPROVED_STATUSES } } },
      { $project: { leaveType: 1, status: 1 } }
    ], as: '_request' } }, { $unwind: '$_request' }
  ]).session(dbSession);
  if (!days.length) return { ...NONE_RESULT, approvedLeaves: [] };
  await LeaveRequestDay.populate(days, { path: '_request.leaveType', model: 'LeaveType', select: 'name category', options: { session: dbSession } });
  const approvedLeaves = days.map(day => {
    const request=day._request;
    return {requestId:request._id,status:request.status,dayType:day.dayType,leaveTypeName:request.leaveType?.name||'Approved leave',leaveTypeCategory:request.leaveType?.category,
      startLocalTime:day.shortLeaveStartTime,endLocalTime:day.shortLeaveEndTime,durationMinutes:day.shortLeaveDurationMinutes};
  });
  const full=days.some(d=>d.dayType==='FULL_DAY'), first=days.some(d=>d.dayType==='HALF_DAY_FIRST_HALF'),second=days.some(d=>d.dayType==='HALF_DAY_SECOND_HALF');
  const leaveFraction=full||first&&second?1:first||second?0.5:0;
  const short=approvedLeaves.find(d=>d.dayType==='SHORT_LEAVE');
  return {leaveState:leaveFraction===1?'FULL_LEAVE':first?'HALF_LEAVE_FIRST':second?'HALF_LEAVE_SECOND':short?'SHORT_LEAVE':'NONE',
    attendanceExpected:leaveFraction<1,presenceFractionCap:1-leaveFraction,leaveFraction,
    leaveTypeName:approvedLeaves[0]?.leaveTypeName||null,leaveTypeCategory:approvedLeaves[0]?.leaveTypeCategory||null,
    shortLeaveWindow:short?{startLocalTime:short.startLocalTime,endLocalTime:short.endLocalTime,durationMinutes:short.durationMinutes}:null,approvedLeaves};
}

/** 'HH:mm' string comparison — mirrors the same lexicographic convention used by attendanceShiftResolver.service.js. */
export function isTimeWithinShortLeaveWindow(shortLeaveWindow, localTimeStr) {
  if (!shortLeaveWindow?.startLocalTime || !shortLeaveWindow?.endLocalTime) return false;
  return localTimeStr >= shortLeaveWindow.startLocalTime && localTimeStr <= shortLeaveWindow.endLocalTime;
}
