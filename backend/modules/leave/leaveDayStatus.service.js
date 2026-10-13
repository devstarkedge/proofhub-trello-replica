import LeaveRequestDay from './leaveRequestDay.model.js';
import mongoose from 'mongoose';
import LeaveRequest from './leaveRequest.model.js';
import { PENDING_STATUSES, APPROVED_STATUSES } from './leaveRequest.model.js';
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
const IN_EFFECT_STATUSES = [...APPROVED_STATUSES, ...PENDING_STATUSES];

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
export async function getDayStatusForUsers({ workspaceId, userIds, startDate, endDate, visibility = 'approved_only', includeLeave = true, requestScope = { workspaceId } }) {
  const [workspace, memberships] = await Promise.all([
    Workspace.findById(workspaceId).select('timezone').lean(),
    WorkspaceMembership.find({ workspace: workspaceId, user: { $in: userIds }, status: 'active' }).select('user department').lean()
  ]);
  const timezone = getWorkspaceTimezone(workspace);

  const membershipByUser = new Map(memberships.map((m) => [String(m.user), m]));
  const departmentIds = Array.from(new Set(memberships.flatMap((m) => (m.department || []).map(String))));

  const calendarContext = await buildCalendarContext({ timezone, departmentIds, startDate, endDate });

  const rangeStart = dateOnlyToInstant(startDate, timezone);
  const rangeEnd = dateOnlyToInstant(endDate, timezone);
  const allowedStatuses = visibility === 'approved_only' ? APPROVED_STATUSES : IN_EFFECT_STATUSES;

  const days = includeLeave ? await LeaveRequestDay.aggregate([
    { $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId), date: { $gte: rangeStart, $lte: rangeEnd } } },
    { $lookup: { from: LeaveRequest.collection.name, localField: 'request', foreignField: '_id', pipeline: [
      { $match: { $and: [requestScope, { workspaceId: new mongoose.Types.ObjectId(workspaceId), requester: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) }, status: { $in: allowedStatuses } }] } },
      { $project: { requester: 1, status: 1, leaveType: 1 } }
    ], as: 'request' } }, { $unwind: '$request' },
    { $project: { request: 1, date: 1, dayType: 1 } }
  ]) : [];
  if (days.length) await LeaveRequestDay.populate(days, { path: 'request.leaveType', model: 'LeaveType', select: 'name category' });
  const userSet = new Set(userIds.map(String));

  const leaveByKey = new Map();
  for (const day of days) {
    const request = day.request;
    if (!request || !allowedStatuses.includes(request.status)) continue;
    if (!userSet.has(String(request.requester))) continue;
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
  const dates = [...eachCalendarDate(startDate, endDate, timezone)].map((date) => ({ date, key: instantToDateOnlyKey(date, timezone) }));
  const classifications = new Map();
  for (const userId of userIds) {
    const membership = membershipByUser.get(String(userId));
    const primaryDepartmentId = membership?.department?.[0] || null;
    const byDate = {};
    for (const { date, key: dateKey } of dates) {
      const leaveEntry = leaveByKey.get(`${userId}|${dateKey}`);
      if (leaveEntry) {
        byDate[dateKey] = leaveEntry;
        continue;
      }
      const cacheKey = `${primaryDepartmentId || ''}:${dateKey}`;
      if (!classifications.has(cacheKey)) classifications.set(cacheKey, classifyDateWithContext(calendarContext, date, primaryDepartmentId).classification);
      byDate[dateKey] = { status: classifications.get(cacheKey) };
    }
    result[String(userId)] = byDate;
  }
  return result;
}
