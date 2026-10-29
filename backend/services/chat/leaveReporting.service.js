import { DateTime } from 'luxon';
import crypto from 'node:crypto';
import LeaveRequest, { APPROVED_STATUSES } from '../../modules/leave/leaveRequest.model.js';
import LeaveRequestDay from '../../modules/leave/leaveRequestDay.model.js';
import LeaveApproval from '../../modules/leave/leaveApproval.model.js';
import LeaveType from '../../modules/leave/leaveType.model.js';
import Workspace from '../../models/Workspace.js';
import User from '../../models/User.js';
import Membership from '../../models/WorkspaceMembership.js';
import Department from '../../models/Department.js';
import State from './ReportingDirectoryState.js';
import Delivery from './LeaveReportingDelivery.js';
import { getWorkspaceTimezone, instantToDateOnlyKey } from '../../modules/leave/leaveTimezone.util.js';
let indexes;

export function leaveCoverage(day) {
  if (day.dayType === 'FULL_DAY') return 'Full day';
  if (day.dayType === 'HALF_DAY_FIRST_HALF') return 'First half';
  if (day.dayType === 'HALF_DAY_SECOND_HALF') return 'Second half';
  if (day.dayType === 'SHORT_LEAVE' && /^([01]\d|2[0-3]):[0-5]\d$/.test(day.shortLeaveStartTime || '') && /^([01]\d|2[0-3]):[0-5]\d$/.test(day.shortLeaveEndTime || '') && day.shortLeaveEndTime > day.shortLeaveStartTime && day.shortLeaveDurationMinutes > 0) return `${day.shortLeaveStartTime}–${day.shortLeaveEndTime}`;
  return null;
}
export function leaveDueAt(dateKey, timezone) {
  return DateTime.fromISO(dateKey, { zone: timezone }).set({ hour: 9 }).toUTC().toJSDate();
}
async function approvedAt(request) {
  if (request.reportingApprovedAt) return request.reportingApprovedAt;
  const last = await LeaveApproval.findOne({ request: request._id, status: 'APPROVED', decidedAt: { $ne: null } }).sort({ decidedAt: -1 }).lean();
  return last?.decidedAt || null;
}

// Called only under the existing durable workspace reporting lease. This is
// independent of request/approval transactions and never delays business APIs.
export async function processLeaveReporting(workspaceId, settings, send, now = new Date(), renew = async () => {}) {
  indexes ||= Delivery.createIndexes().catch(error => { indexes = null; throw error; });
  await indexes;
  const workspace = await Workspace.findById(workspaceId).lean();
  if (!workspace || workspace.isActive === false) return;
  const zone = getWorkspaceTimezone(workspace), local = DateTime.fromJSDate(now).setZone(zone);
  await State.updateOne({ workspaceId, leaveReportingSince: null }, { $set: { leaveReportingSince: local.startOf('day').toUTC().toJSDate() } });
  const state = await State.findOne({ workspaceId }).lean();
  const since = state.leaveReportingSince;
  if (!since) return;
  // Existing installations start with today's dates. Persisted activation
  // bounds let subsequent restarts recover missed dates without old-history spam.
  const floor = state.leaveSchedulingFloor || since;
  const requests = await LeaveRequest.find({ status: { $in: APPROVED_STATUSES }, endDate: { $gte: floor },
    ...(state.leaveRequestCursor ? { _id: { $gt: state.leaveRequestCursor } } : {}) }).sort('_id').limit(100).select('_id requester reportingApprovedAt startDate endDate').lean();
  for (const request of requests) {
    await renew();
    const approvalTime = await approvedAt(request);
    if (!approvalTime) continue; // An unverifiable approval date cannot justify a retroactive publication.
    for await (const day of LeaveRequestDay.find({ request: request._id, date: { $gte: floor, $lte: local.endOf('day').toUTC().toJSDate() } }).cursor()) {
      const dateKey = instantToDateOnlyKey(day.date, zone), dueAt = leaveDueAt(dateKey, zone);
      if (+dueAt > +now || +new Date(approvalTime) > +dueAt || !leaveCoverage(day) || !(day.requestedAmount > 0) || +day.date < +request.startDate || +day.date > +request.endDate) continue;
      try { await Delivery.updateOne({ request: request._id, user: request.requester, dateKey }, { $setOnInsert: { workspaceId, request: request._id, user: request.requester, dateKey, dueAt } }, { upsert: true }); }
      catch (error) { if (error.code !== 11000) throw error; }
    }
  }
  await State.updateOne({ workspaceId }, { $set: { leaveRequestCursor: requests.length === 100 ? requests.at(-1)._id : null,
    ...(requests.length < 100 ? { leaveSchedulingFloor: local.startOf('day').toUTC().toJSDate() } : {}) } });
  const urgent = await Delivery.find({ availableAt: { $lte: now }, $or: [{ needsReconcile: true },
    { dateKey: local.toISODate(), ...(state.leaveCurrentCursor ? { _id: { $gt: state.leaveCurrentCursor } } : {}) }] }).sort({ needsReconcile: -1, _id: 1 }).limit(100);
  const historical = urgent.length < 100 ? await Delivery.find({ availableAt: { $lte: now }, needsReconcile: { $ne: true }, dateKey: { $ne: local.toISODate() },
    _id: { ...(state.leaveDeliveryCursor ? { $gt: state.leaveDeliveryCursor } : {}), $nin: urgent.map(row => row._id) } }).sort('_id').limit(100 - urgent.length) : [];
  const deliveries = [...urgent, ...historical];
  for (const row of deliveries) {
    await renew();
    const request = await LeaveRequest.findOne({ _id: row.request, requester: row.user }).lean();
    const day = await LeaveRequestDay.findOne({ request: row.request, date: { $gte: DateTime.fromISO(row.dateKey, { zone }).startOf('day').toUTC().toJSDate(), $lte: DateTime.fromISO(row.dateKey, { zone }).endOf('day').toUTC().toJSDate() } }).lean();
    const member = await Membership.findOne({ workspace: workspaceId, user: row.user, status: 'active' }).lean();
    const employee = await User.findById(row.user).select('name isActive').lean();
    const approvalTime = request ? await approvedAt(request) : null;
    const valid = request && APPROVED_STATUSES.includes(request.status) && approvalTime && +new Date(approvalTime) <= +row.dueAt &&
      +row.dueAt <= +now && day && +day.date >= +request.startDate && +day.date <= +request.endDate && day.requestedAmount > 0 && leaveCoverage(day) && member && employee && employee.isActive !== false;
    const departments = valid ? await Department.find({ _id: { $in: member.department || [] }, isActive: true }).select('_id name').lean() : [];
    const type = request ? await LeaveType.findById(request.leaveType).select('name').lean() : null;
    const payload = { eventType: 'leave.daily_report', eventId: `leave-${row.request}-${row.user}-${row.dateKey}`, workspaceId: String(workspaceId),
      employee: { flowTaskUserId: String(row.user), name: employee?.name || 'Employee' }, leaveRequestId: String(row.request), dateKey: row.dateKey,
      leaveType: type?.name || 'Leave', coverage: valid ? leaveCoverage(day) : '', retracted: !valid,
      departments: departments.map(d => ({ id: String(d._id), name: d.name })), previousDepartmentIds: row.destinations };
    const digest = crypto.createHash('sha256').update(JSON.stringify({ ...payload, previousDepartmentIds: undefined })).digest('hex');
    if (digest !== row.digest) { row.revision++; row.digest = digest; row.payload = payload; await row.save(); }
    if (row.deliveredRevision === row.revision) { if (row.needsReconcile) { row.needsReconcile = false; await row.save(); } continue; }
    try {
      // The queue re-resolves approval/coverage immediately before each attempt.
      await send({ ...payload, reportRevision: row.revision }, settings);
      row.deliveredRevision = row.revision; row.needsReconcile = false; row.destinations = [...new Set([...row.destinations, ...departments.map(d => String(d._id))])]; row.attempts = 0; row.lastError = ''; row.availableAt = new Date(0); await row.save();
    } catch (error) {
      row.attempts++; row.lastError = `ChatApp leave reporting delivery failed (${error.response?.status || error.code || 'network'})`;
      row.availableAt = new Date(+now + Math.min(300000, 1000 * 2 ** Math.min(row.attempts, 9))); await row.save();
    }
  }
  const current = urgent.filter(row => row.dateKey === local.toISODate());
  await State.updateOne({ workspaceId }, { $set: { leaveCurrentCursor: urgent.length === 100 && current.length ? current.at(-1)._id : null,
    ...(urgent.length < 100 ? { leaveDeliveryCursor: historical.length === 100 - urgent.length ? historical.at(-1)?._id || null : null } : {}) } });
}
