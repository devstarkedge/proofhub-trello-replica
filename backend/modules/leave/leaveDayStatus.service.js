import LeaveRequestDay from './leaveRequestDay.model.js';
import Workspace from '../../models/Workspace.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import { getWorkspaceTimezone, dateOnlyToInstant, instantToDateOnlyKey, eachCalendarDate } from './leaveTimezone.util.js';
import { buildCalendarContext, classifyDateWithContext } from './leaveCalendar.service.js';

// Leave states still "in effect" for the purposes of the Teams/Task-List
// day-status overlay. Deliberately excludes every CANCELLED_*/REJECTED
// status — a cancelled-by-HR day must read back as an ordinary WORKING_DAY
// (see spec's "HR cancels on the day" flow), never as a residual leave
// indicator, and existing task-tracked time for that date is untouched by
// this read-only overlay (it never queries Card/Subtask/SubtaskNano).
const IN_EFFECT_STATUSES = ['APPROVED', 'CANCELLATION_REQUESTED', 'PARTIALLY_APPROVED', 'PENDING_APPROVAL'];

/**
 * For each (user, date) in range, resolve one of: ON_LEAVE (with dayType +
 * leave type name), or the underlying calendar classification
 * (WORKING_DAY/HOLIDAY/WEEKLY_OFF). This is the single read-only join point
 * for the Teams -> Task List -> Task Time Tracking integration — callers
 * separately fetch actual tracked hours from teamAnalyticsController's own
 * aggregation and merge client-side; this function never touches that data.
 *
 * `visibility` controls whether PENDING/PARTIALLY_APPROVED requests are
 * included (a Manager/HR/Admin viewing their team) or only fully APPROVED
 * ones (an Employee viewing a coworker they have no approval visibility
 * into) — callers must pass the narrower option unless the viewer is
 * authorized to see pending leave for these users.
 */
export async function getDayStatusForUsers({ workspaceId, userIds, startDate, endDate, visibility = 'approved_only' }) {
  const workspace = await Workspace.findById(workspaceId).select('timezone').lean();
  const timezone = getWorkspaceTimezone(workspace);

  const memberships = await WorkspaceMembership.find({ workspace: workspaceId, user: { $in: userIds } })
    .select('user department')
    .lean();
  const membershipByUser = new Map(memberships.map((m) => [String(m.user), m]));
  const departmentIds = Array.from(new Set(memberships.flatMap((m) => (m.department || []).map(String))));

  const calendarContext = await buildCalendarContext({ timezone, departmentIds });

  const rangeStart = dateOnlyToInstant(startDate, timezone);
  const rangeEnd = dateOnlyToInstant(endDate, timezone);
  const allowedStatuses = visibility === 'approved_only' ? ['APPROVED', 'CANCELLATION_REQUESTED'] : IN_EFFECT_STATUSES;

  const days = await LeaveRequestDay.find({ workspaceId, date: { $gte: rangeStart, $lte: rangeEnd } })
    .populate({
      path: 'request',
      select: 'requester status leaveType',
      populate: { path: 'leaveType', select: 'name category' }
    })
    .lean();

  const leaveByKey = new Map();
  for (const day of days) {
    const request = day.request;
    if (!request || !allowedStatuses.includes(request.status)) continue;
    if (!userIds.some((id) => String(id) === String(request.requester))) continue;
    const dateKey = instantToDateOnlyKey(day.date, timezone);
    leaveByKey.set(`${request.requester}|${dateKey}`, {
      status: 'ON_LEAVE',
      requestStatus: request.status,
      dayType: day.dayType,
      leaveTypeName: request.leaveType?.name || null,
      leaveTypeCategory: request.leaveType?.category || null
    });
  }

  const result = {};
  for (const userId of userIds) {
    const membership = membershipByUser.get(String(userId));
    const primaryDepartmentId = membership?.department?.[0] || null;
    const byDate = {};
    for (const date of eachCalendarDate(startDate, endDate, timezone)) {
      const dateKey = instantToDateOnlyKey(date, timezone);
      const leaveEntry = leaveByKey.get(`${userId}|${dateKey}`);
      if (leaveEntry) {
        byDate[dateKey] = leaveEntry;
        continue;
      }
      const { classification } = classifyDateWithContext(calendarContext, date, primaryDepartmentId);
      byDate[dateKey] = { status: classification };
    }
    result[String(userId)] = byDate;
  }
  return result;
}
