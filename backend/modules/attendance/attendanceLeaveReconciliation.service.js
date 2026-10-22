import LeaveRequest, { APPROVED_STATUSES } from '../leave/leaveRequest.model.js';
import LeaveRequestDay from '../leave/leaveRequestDay.model.js';

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
  const requests = await LeaveRequest.find({ workspaceId, requester:userId, status:{$in:APPROVED_STATUSES}, startDate:{$lte:dayInstant}, endDate:{$gte:dayInstant} })
    .select('_id leaveType status').session(dbSession).populate({path:'leaveType',select:'name category',options:{session:dbSession}}).lean();
  if (!requests.length) return { ...NONE_RESULT, approvedLeaves:[] };
  const days = await LeaveRequestDay.find({workspaceId,date:dayInstant,request:{$in:requests.map(r=>r._id)}}).session(dbSession).lean();
  const approvedLeaves = days.map(day => {
    const request=requests.find(r=>String(r._id)===String(day.request));
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
