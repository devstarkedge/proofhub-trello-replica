import LeaveRequest from '../leave/leaveRequest.model.js';
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

const DAY_TYPE_TO_LEAVE_STATE = {
  FULL_DAY: 'FULL_LEAVE',
  HALF_DAY_FIRST_HALF: 'HALF_LEAVE_FIRST',
  HALF_DAY_SECOND_HALF: 'HALF_LEAVE_SECOND',
  SHORT_LEAVE: 'SHORT_LEAVE'
};

/** The approved leave (if any) in effect for this user on this exact business date. `dayInstant` must already be a workspace-tz-midnight instant (dateOnlyToInstant), not a bare `new Date()`. */
export async function resolveLeaveContextForDate({ workspaceId, userId, dayInstant }) {
  const approvedRequests = await LeaveRequest.find({
    workspaceId, requester: userId, status: 'APPROVED',
    startDate: { $lte: dayInstant }, endDate: { $gte: dayInstant }
  }).select('_id').lean();
  if (!approvedRequests.length) return NONE_RESULT;

  const requestIds = approvedRequests.map((r) => r._id);
  const day = await LeaveRequestDay.findOne({ workspaceId, date: dayInstant, request: { $in: requestIds } })
    .populate({ path: 'request', select: 'leaveType', populate: { path: 'leaveType', select: 'name category' } })
    .lean();
  if (!day) return NONE_RESULT;

  const leaveState = DAY_TYPE_TO_LEAVE_STATE[day.dayType] || 'NONE';
  if (leaveState === 'NONE') return NONE_RESULT;

  const base = {
    leaveState,
    leaveTypeName: day.request?.leaveType?.name || null,
    leaveTypeCategory: day.request?.leaveType?.category || null,
    shortLeaveWindow: null
  };

  if (leaveState === 'FULL_LEAVE') {
    return { ...base, attendanceExpected: false, presenceFractionCap: 0, leaveFraction: 1 };
  }
  if (leaveState === 'HALF_LEAVE_FIRST' || leaveState === 'HALF_LEAVE_SECOND') {
    return { ...base, attendanceExpected: true, presenceFractionCap: 0.5, leaveFraction: 0.5 };
  }
  // SHORT_LEAVE never reduces the day's presence/leave fraction on its own
  // — it only excuses the specific covered window from a late/early-exit
  // flag. Callers use `shortLeaveWindow` for that check (see
  // isTimeWithinShortLeaveWindow below); Short Leave's own duration
  // validity was already enforced by the Leave module at submission time.
  return {
    ...base, attendanceExpected: true, presenceFractionCap: 1, leaveFraction: 0,
    shortLeaveWindow: {
      startLocalTime: day.shortLeaveStartTime,
      endLocalTime: day.shortLeaveEndTime,
      durationMinutes: day.shortLeaveDurationMinutes
    }
  };
}

/** 'HH:mm' string comparison — mirrors the same lexicographic convention used by attendanceShiftResolver.service.js. */
export function isTimeWithinShortLeaveWindow(shortLeaveWindow, localTimeStr) {
  if (!shortLeaveWindow?.startLocalTime || !shortLeaveWindow?.endLocalTime) return false;
  return localTimeStr >= shortLeaveWindow.startLocalTime && localTimeStr <= shortLeaveWindow.endLocalTime;
}
