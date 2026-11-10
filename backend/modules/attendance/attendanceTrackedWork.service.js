import { contextFor, policyFor } from '../tracking/tracking.service.js';
import { readVisibilityScope } from '../tracking/tracking.visibility.js';
import { dashboardReadPipeline } from '../tracking/tracking.dashboardRead.js';
import { WorkSession } from '../tracking/tracking.models.js';
import { effectiveAttendanceSession } from './attendanceRegularizationOverlay.js';
import { intervalMinutes, unionIntervals } from './attendanceIntervals.js';
import { readRecentWorkBreakWindows } from './attendanceWorkBreak.js';
const id = value => String(value?._id || value || '');
export const unavailableWork = () => ({ seconds: null, reason: 'No authorized tracked work records are available.' });

// Reuse Tracking's visibility pipeline, including project and historical
// department guards. Attendance access never implies Tracking access.
export async function readAttendanceWork({ workspaceId, viewer, userIds, startDate, endDate, now = new Date() }) {
  const result = new Map();
  if (!userIds.length) return result;
  try {
    const [ctx, policy] = await Promise.all([contextFor(workspaceId, viewer._id || viewer.id, { readOnly: true }), policyFor(workspaceId)]);
    const scope = await readVisibilityScope(ctx), owners = userIds.filter(owner => scope.canOwner(owner));
    if (!owners.length) return result;
    const workBreakWindows = await readRecentWorkBreakWindows(workspaceId, now);
    const pipeline = dashboardReadPipeline({ workspaceId, ctx, scope, owners, bounds: { workDateKey: { $gte: startDate, $lte: endDate } }, query: {}, dates: { start: new Date(0), end: now }, now, policy, attendanceDetails: true, workBreakWindows });
    pipeline.push({ $project: { user: 1, workDateKey: 1, _selected: 1, _cutoff: 1, _attendance: 1 } });
    const groups = new Map();
    for (const session of await WorkSession.aggregate(pipeline).option({ maxTimeMS: 20000, allowDiskUse: true })) {
      const key = `${id(session.user)}:${session.workDateKey}`;
      if (!groups.has(key)) groups.set(key, { intervals: [], unresolved: false });
      const group = groups.get(key);
      if (!session._attendance) { group.unresolved = true; continue; }
      const attendance = effectiveAttendanceSession(session._attendance);
      for (const segment of session._selected || []) group.intervals.push([
        Math.max(+new Date(segment.startedAt), +new Date(attendance.checkInAt)),
        Math.min(+now, +new Date(session._cutoff), attendance.checkOutAt ? +new Date(attendance.checkOutAt) : Infinity, segment.endedAt ? +new Date(segment.endedAt) : Infinity)
      ]);
    }
    for (const [key, group] of groups) result.set(key, group.unresolved ? unavailableWork() : { seconds: intervalMinutes(unionIntervals(group.intervals)) * 60, reason: null });
    return result;
  } catch (error) {
    if ([403, 404].includes(error.statusCode)) return result;
    throw error;
  }
}
