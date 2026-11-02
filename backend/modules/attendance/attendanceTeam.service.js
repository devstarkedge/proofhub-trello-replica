import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import AttendanceDay from './attendanceDay.model.js';
import AttendanceSession from './attendanceSession.model.js';
import AttendanceMemberProfile from './attendanceMemberProfile.model.js';
import AttendanceRegularization from './attendanceRegularization.model.js';
import AttendancePolicyVersion from './attendancePolicyVersion.model.js';
import Workspace from '../../models/Workspace.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import Department from '../../models/Department.js';
import User from '../../models/User.js';
import LeaveRequest, { APPROVED_STATUSES } from '../leave/leaveRequest.model.js';
import LeaveRequestDay from '../leave/leaveRequestDay.model.js';
import LeaveType from '../leave/leaveType.model.js';
import { resolveLeaveAccessScope } from '../leave/leaveAuthorization.service.js';
import { resolveApplicablePolicyVersion } from './attendancePolicy.service.js';
import { resolveAttendanceEligibility } from './attendanceEligibility.service.js';
import { resolveAttendanceAccess, assertCanViewDepartment, assertCanViewUser } from './attendanceAuthorization.service.js';
import { effectiveAttendanceSession, applyRegularizationOverlay } from './attendanceRegularizationOverlay.js';
import { intervalMinutes, attendanceIntervals, attendanceIntervalMillisecondsExpression } from './attendanceIntervals.js';
import { buildCalendarContext, classifyDateWithContext } from '../workCalendar/workCalendarFacade.js';
import { dateOnlyToInstant } from '../leave/leaveTimezone.util.js';
import { readAttendanceWork, unavailableWork } from './attendanceTrackedWork.service.js';



import { ErrorResponse } from '../../middleware/errorHandler.js';
import { validateTeamQuery, serializeTeamRow, csvLine, TEAM_STATUSES, TEAM_WORK_MODES } from './attendanceTeamReport.js';

const id = value => String(value?._id || value || '');
const oid = value => new mongoose.Types.ObjectId(id(value));
const queryOptions = { maxTimeMS: 20000, allowDiskUse: true };
const emptyTotals = () => ({ totalMembers: 0, membersWithRecords: 0, present: 0, halfDays: 0, absent: 0, missingCheckout: 0, leaveDays: 0, attendanceMinutes: null });
const dayFields = { _id: 1, user: 1, workDateKey: 1, calendarDayType: 1, isCalendarWorkingDay: 1, workMode: 1,
  firstCheckInAt: 1, lastCheckOutAt: 1, workedMinutes: 1, shiftExpectedMinutes: 1, presenceState: 1,
  punctualityState: 1, leaveState: 1, presenceFraction: 1, leaveFraction: 1, exceptionFlags: 1,
  isFinalized: 1, policyVersion: 1, effectiveOfficeHoursStart: 1, effectiveOfficeHoursEnd: 1, effectiveOfficeHoursSource: 1 };

// Both sides of every union/lookup carry an explicit tenant predicate: Mongoose
// middleware does not scope foreign pipelines. These projections contain no
// evidence bundles, request reasons, checkout receipts or screenshot data.
export function teamDayPipeline({ workspaceId, userIds, startDate, endDate, timezone }) {
  const tenant = oid(workspaceId), users = userIds.map(oid);
  return [
    { $match: { workspaceId: tenant, user: { $in: users }, workDateKey: { $gte: startDate, $lte: endDate } } },
    { $project: { ...dayFields, hasAttendance: { $literal: true } } },
    { $unionWith: { coll: LeaveRequestDay.collection.name, pipeline: [
      { $match: { workspaceId: tenant, date: { $gte: dateOnlyToInstant(startDate, timezone), $lte: dateOnlyToInstant(endDate, timezone) } } },
      { $lookup: { from: LeaveRequest.collection.name, localField: 'request', foreignField: '_id', pipeline: [
        { $match: { workspaceId: tenant, requester: { $in: users }, status: { $in: APPROVED_STATUSES } } },
        { $project: { requester: 1 } }
      ], as: 'approved' } }, { $unwind: '$approved' },
      { $project: { user: '$approved.requester', workDateKey: { $dateToString: { date: '$date', format: '%Y-%m-%d', timezone } },
        _leaveType: { $cond: ['$isConsuming', '$dayType', null] },
        calendarDayType: '$calendarClassification', isCalendarWorkingDay: { $eq: ['$calendarClassification', 'WORKING_DAY'] }, hasAttendance: { $literal: false } } }
    ] } },
    { $sort: { hasAttendance: -1, _id: 1 } },
    { $group: { _id: { user: '$user', date: '$workDateKey' }, day: { $first: '$$ROOT' }, leaveTypes: { $addToSet: '$_leaveType' } } },
    { $replaceRoot: { newRoot: { $mergeObjects: ['$day', { leaveTypes: '$leaveTypes' }] } } },
    { $set: { leaveState: { $switch: { branches: [
      { case: { $or: [{ $in: ['FULL_DAY', '$leaveTypes'] }, { $and: [{ $in: ['HALF_DAY_FIRST_HALF', '$leaveTypes'] }, { $in: ['HALF_DAY_SECOND_HALF', '$leaveTypes'] }] }] }, then: 'FULL_LEAVE' },
      { case: { $in: ['HALF_DAY_FIRST_HALF', '$leaveTypes'] }, then: 'HALF_LEAVE_FIRST' },
      { case: { $in: ['HALF_DAY_SECOND_HALF', '$leaveTypes'] }, then: 'HALF_LEAVE_SECOND' },
      { case: { $in: ['SHORT_LEAVE', '$leaveTypes'] }, then: 'SHORT_LEAVE' }
    ], default: { $ifNull: ['$leaveState', 'NONE'] } } } } },
    { $set: { leaveFraction: { $switch: { branches: [
      { case: { $eq: ['$leaveState', 'FULL_LEAVE'] }, then: 1 },
      { case: { $in: ['$leaveState', ['HALF_LEAVE_FIRST', 'HALF_LEAVE_SECOND']] }, then: 0.5 }
    ], default: { $ifNull: ['$leaveFraction', 0] } } }, displayStatus: { $switch: { branches: [
      { case: { $eq: ['$leaveState', 'FULL_LEAVE'] }, then: 'ON_LEAVE' },
      { case: { $eq: ['$calendarDayType', 'HOLIDAY'] }, then: 'HOLIDAY' },
      { case: { $eq: ['$isCalendarWorkingDay', false] }, then: 'WEEKLY_OFF' }
    ], default: { $ifNull: ['$presenceState', 'UNKNOWN'] } } } } }
  ];
}

async function prepare({ viewer, workspaceId, query = {}, now = new Date(), historicalSubject = false }) {
  const [workspace, access, membership] = await Promise.all([
    Workspace.findById(workspaceId).select('timezone attendanceModuleEnabled').lean(),
    resolveAttendanceAccess({ viewer, workspaceId }),
    WorkspaceMembership.findOne({ workspace: workspaceId, user: viewer._id || viewer.id, status: 'active' }).select('_id').lean()
  ]);
  if (!membership) throw new ErrorResponse('Active workspace membership required', 403);
  if (!workspace?.attendanceModuleEnabled) throw new ErrorResponse('Attendance is not enabled', 403);
  if (access.scope === 'self') throw new ErrorResponse('Team attendance access required', 403);
  const timezone = workspace.timezone || 'Asia/Kolkata', q = validateTeamQuery(query, timezone, now);
  if (q.userId) assertCanViewUser(access, viewer._id || viewer.id, q.userId);
  if (q.departmentId) assertCanViewDepartment(access, q.departmentId);
  const departmentFilter = { workspaceId, ...(access.scope === 'workspace' ? {} : { _id: { $in: access.allowedDepartmentIds } }) };
  const [departments, members, profiles, policy, attendanceHistory, leaveHistory] = await Promise.all([
    Department.find(departmentFilter).select('_id name members isActive').lean(),
    WorkspaceMembership.find({ workspace: workspaceId, ...(access.allowedUserIds ? { user: { $in: access.allowedUserIds } } : {}) }).select('user role status department joinedAt').lean(),
    AttendanceMemberProfile.find({ workspaceId, isActive: true, ...(access.allowedUserIds ? { user: { $in: access.allowedUserIds } } : {}) }).lean(),
    resolveApplicablePolicyVersion({ workspaceId }),
    AttendanceDay.distinct('user', { workspaceId, ...(historicalSubject && q.userId ? { user: oid(q.userId) } : { workDateKey: { $gte: q.startDate, $lte: q.endDate }, ...(access.allowedUserIds ? { user: { $in: access.allowedUserIds } } : {}) }) }),
    LeaveRequestDay.aggregate([
      { $match: { workspaceId: oid(workspaceId), ...(historicalSubject && q.userId ? {} : { date: { $gte: dateOnlyToInstant(q.startDate, timezone), $lte: dateOnlyToInstant(q.endDate, timezone) } }) } },
      { $lookup: { from: LeaveRequest.collection.name, localField: 'request', foreignField: '_id', pipeline: [
        { $match: { workspaceId: oid(workspaceId), status: { $in: APPROVED_STATUSES }, ...(q.userId ? { requester: oid(q.userId) } : access.allowedUserIds ? { requester: { $in: access.allowedUserIds.map(oid) } } : {}) } },
        { $project: { requester: 1 } }
      ], as: 'approved' } }, { $unwind: '$approved' }, { $group: { _id: '$approved.requester' } }
    ]).option(queryOptions)
  ]);
  const history = [...new Map([...attendanceHistory, ...leaveHistory.map(row => row._id)].map(user => [id(user), user])).values()];
  const selectedDepartment = q.departmentId ? departments.find(d => id(d) === q.departmentId && d.isActive !== false) : null;
  if (q.departmentId && !selectedDepartment) throw new ErrorResponse('Department not found', 404);
  const profileMap = new Map(profiles.map(p => [id(p.user), p])), historicalIds = new Set(history.map(id));
  const memberIds = new Set(members.map(m => id(m.user))), departmentMap = new Map(departments.map(d => [id(d), d]));
  const rosterDepartments = new Map();
  for (const department of departments) for (const member of department.members || []) {
    const list = rosterDepartments.get(id(member)) || []; list.push(department._id); rosterDepartments.set(id(member), list);
  }
  const roster = [];
  for (const member of members) {
    if (q.userId && id(member.user) !== q.userId) continue;
    if (selectedDepartment && !(member.department || []).some(d => id(d) === q.departmentId) && !(selectedDepartment.members || []).some(u => id(u) === id(member.user))) continue;
    const eligibility = await resolveAttendanceEligibility({ workspaceId, userId: member.user, membership: member, workspace, attendancePolicy: policy, resolvedProfile: profileMap.get(id(member.user)) || {} });
    if (eligibility.attendanceRequired || historicalIds.has(id(member.user))) roster.push({ ...member, historical: member.status !== 'active' || !eligibility.attendanceRequired });
  }
  // Deleted membership rows must not erase workspace-wide authorized history.
  if (access.scope === 'workspace' && !q.departmentId) for (const user of history) {
    if ((!q.userId || id(user) === q.userId) && !memberIds.has(id(user))) roster.push({ user, historical: true, department: [] });
  }
  const users = await User.find({ _id: { $in: roster.map(m => m.user) } }).select('name email avatar').lean();
  const userMap = new Map(users.map(u => [id(u), u]));
  const subjects = roster.map(m => ({ user: { _id: m.user, name: null, email: null, avatar: null, ...userMap.get(id(m.user)) }, historical: !!m.historical, primaryDepartmentId: m.department?.[0] || null,
    departments: [...new Set([...(m.department || []), ...(rosterDepartments.get(id(m.user)) || [])].map(id))].map(key => departmentMap.get(key)).filter(Boolean).map(d => ({ _id: d._id, name: d.name }))
  })).filter(row => !q.search || [row.user.name, row.user.email].some(value => value?.toLocaleLowerCase().includes(q.search.toLocaleLowerCase())));
  const today = DateTime.fromJSDate(now).setZone(timezone).toISODate(), through = q.endDate < today ? q.endDate : today;
  const expectedDates = q.startDate > through ? 0 : Math.round(DateTime.fromISO(through).diff(DateTime.fromISO(q.startDate), 'days').days) + 1;
  return { viewer, workspaceId, workspace, access, q, timezone, now, today, expectedDates, subjects, departments };
}

const countIf = expression => ({ $sum: { $cond: [expression, 1, 0] } });
// Duration-only projection shared by overview and daily CSV. Historical
// snapshots remain authoritative; running intervals are unioned as of serverNow.
function sessionFactsStages(ctx) {
  const now = ctx.now;
  const corrected = { $and: [
    { $ne: [{ $ifNull: ['$regularizationResolution.appliedAt', null] }, null] },
    { $ne: [{ $ifNull: ['$regularizationResolution.checkInAt', null] }, null] },
    { $ne: [{ $ifNull: ['$regularizationResolution.checkOutAt', null] }, null] }
  ] };
  return [
    { $lookup: { from: AttendanceSession.collection.name, let: { owner: '$user', date: '$workDateKey' }, pipeline: [
      { $match: { workspaceId: oid(ctx.workspaceId), $expr: { $and: [{ $eq: ['$user', '$$owner'] }, { $eq: ['$workDateKey', '$$date'] }] } } },
      { $project: { status: 1, checkInAt: 1, checkOutAt: 1, effectiveShiftEndAt: 1, missedCheckoutCutoffAt: 1, regularizationResolution: 1 } },
      { $set: { _intervalStart: { $cond: [corrected, '$regularizationResolution.checkInAt', '$checkInAt'] },
        _intervalEnd: { $cond: [corrected, '$regularizationResolution.checkOutAt', { $switch: { branches: [
          { case: { $in: ['$status', ['CLOSED', 'COMPLETED']] }, then: '$checkOutAt' },
          { case: { $eq: ['$status', 'ACTIVE'] }, then: { $min: [now, { $ifNull: ['$missedCheckoutCutoffAt', now] }] } }
        ], default: null } }] } } }, { $sort: { _intervalStart: 1 } }
    ], as: '_sessions' } },
    { $set: { _live: { $anyElementTrue: { $map: { input: '$_sessions', as: 's', in: { $and: [
      { $eq: ['$$s.status', 'ACTIVE'] }, { $eq: [{ $ifNull: ['$$s.regularizationResolution.appliedAt', null] }, null] },
      { $gt: [{ $ifNull: ['$$s.missedCheckoutCutoffAt', new Date(8640000000000000)] }, now] }
    ] } } } } } },
    { $set: { workedMinutes: { $cond: ['$_live', { $floor: { $add: [{ $divide: [attendanceIntervalMillisecondsExpression('$_sessions'), 60000] }, 0.5] } }, '$workedMinutes'] } } }
  ];
}

function summarizedPipeline(ctx) {
  const { q, today, now } = ctx;
  const matches = { $and: [q.status ? { $eq: ['$displayStatus', q.status] } : true, q.workMode ? { $eq: ['$workMode', q.workMode] } : true] };
  const ended = { $or: ['$isFinalized', { $and: [{ $gt: [{ $size: '$_sessions' }, 0] }, { $allElementsTrue: { $map: { input: '$_sessions', as: 's', in: { $or: [
    { $ne: [{ $ifNull: ['$$s.regularizationResolution.appliedAt', null] }, null] }, { $in: ['$$s.status', ['CLOSED', 'COMPLETED']] }
  ] } } } }] }] };
  const required = { $and: [{ $eq: ['$isCalendarWorkingDay', true] }, { $lt: ['$leaveFraction', 1] }] };
  return [
    ...teamDayPipeline({ ...ctx, userIds: ctx.subjects.map(s => s.user._id), startDate: q.startDate, endDate: q.endDate }),
    ...sessionFactsStages(ctx),
    { $set: { _matches: matches, _elapsed: { $lte: ['$workDateKey', today] }, _required: required, _ended: ended,
      _ongoing: { $or: ['$_live', { $anyElementTrue: { $map: { input: '$_sessions', as: 's', in: { $and: [
        { $eq: [{ $ifNull: ['$$s.regularizationResolution.appliedAt', null] }, null] }, { $gt: ['$$s.effectiveShiftEndAt', now] }
      ] } } } }] } } },
    { $set: { _unresolved: { $or: [
      { $not: [{ $in: ['$isCalendarWorkingDay', [true, false]] }] },
      { $eq: ['$presenceState', 'MISSING_CHECKOUT'] },
      { $and: ['$_required', { $not: [{ $and: [
      '$hasAttendance', '$_ended', { $ne: ['$presenceState', 'MISSING_CHECKOUT'] }, { $ne: ['$presenceState', 'NOT_STARTED'] },
      { $ne: [{ $ifNull: ['$policyVersion', null] }, null] }, { $isNumber: '$presenceFraction' },
      { $not: [{ $in: ['LEAVE_COVERAGE_UNRESOLVED', { $ifNull: ['$exceptionFlags', []] }] }] },
      { $gte: ['$presenceFraction', 0] }, { $lte: ['$presenceFraction', { $subtract: [1, '$leaveFraction'] }] }
    ] }] }] }] } } },
    { $group: { _id: '$user', recordedDays: countIf('$_matches'), attendanceDays: countIf({ $and: ['$_matches', '$hasAttendance'] }),
      measuredDays: countIf({ $and: ['$_matches', '$hasAttendance', { $isNumber: '$workedMinutes' }] }),
      ...Object.fromEntries([['present', 'PRESENT'], ['halfDays', 'HALF_PRESENT'], ['absent', 'ABSENT'], ['missingCheckout', 'MISSING_CHECKOUT'], ['leaveDays', 'ON_LEAVE']].map(([key, state]) => [key, countIf({ $and: ['$_matches', { $eq: ['$displayStatus', state] }] })])),
      attendanceMinutes: { $sum: { $cond: [{ $and: ['$_matches', '$hasAttendance', { $isNumber: '$workedMinutes' }] }, '$workedMinutes', 0] } },
      coveredDates: countIf('$_elapsed'), unresolvedDays: countIf({ $and: ['$_elapsed', { $not: ['$_ongoing'] }, '$_unresolved'] }),
      presenceCredit: { $sum: { $cond: [{ $and: ['$_elapsed', '$_required', { $not: ['$_ongoing'] }, { $not: ['$_unresolved'] }] }, '$presenceFraction', 0] } },
      requiredCredit: { $sum: { $cond: [{ $and: ['$_elapsed', '$_required', { $not: ['$_ongoing'] }] }, { $subtract: [1, '$leaveFraction'] }, 0] } }
    } }
  ];
}

async function summaryRows(ctx) {
  const groups = ctx.subjects.length ? await AttendanceDay.aggregate(summarizedPipeline(ctx)).option(queryOptions) : [];
  const groupMap = new Map(groups.map(g => [id(g), g]));
  const rows = ctx.subjects.map(subject => serializeTeamRow({ ...subject, ...groupMap.get(id(subject.user)) }, ctx.expectedDates))
    .filter(row => !(ctx.q.status || ctx.q.workMode) || row.recordedDays > 0);
  const work = await readAttendanceWork({ ...ctx, userIds: rows.map(row => row.user._id), startDate: ctx.q.startDate, endDate: ctx.q.endDate });
  let matches = null;
  if (ctx.q.status || ctx.q.workMode) {
    const pipeline = teamDayPipeline({ ...ctx, userIds: rows.map(row => row.user._id), startDate: ctx.q.startDate, endDate: ctx.q.endDate });
    pipeline.push({ $match: { ...(ctx.q.status ? { displayStatus: ctx.q.status } : {}), ...(ctx.q.workMode ? { workMode: ctx.q.workMode } : {}) } }, { $project: { user: 1, workDateKey: 1 } });
    matches = new Set((await AttendanceDay.aggregate(pipeline).option(queryOptions)).map(day => id(day.user) + ':' + day.workDateKey));
  }
  for (const row of rows) {
    const entries = [...work].filter(([key]) => key.startsWith(id(row.user) + ':') && (!matches || matches.has(key))).map(([, value]) => value);
    row.workSeconds = entries.length && entries.every(value => value.seconds != null) ? entries.reduce((total, value) => total + value.seconds, 0) : null;
  }
  const { sort, direction } = ctx.q, sign = direction === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    const value = row => sort === 'department' ? row.departments.map(d => d.name).join(', ') : sort === 'attendanceRate' ? row.attendanceRate.value : ['name', 'email'].includes(sort) ? row.user[sort] : row[sort];
    const av = value(a), bv = value(b);
    if (av == null && bv != null) return 1;
    if (bv == null && av != null) return -1;
    return (typeof av === 'string' ? av.localeCompare(bv || '', undefined, { sensitivity: 'base' }) : (av || 0) - (bv || 0)) * sign || id(a.user).localeCompare(id(b.user));
  });
  return rows;
}

export async function getTeamAttendance(args) {
  const ctx = await prepare(args), rows = await summaryRows(ctx), totals = emptyTotals();
  totals.totalMembers = rows.length;
  for (const row of rows) {
    if (row.recordedDays) totals.membersWithRecords++;
    for (const key of ['present', 'halfDays', 'absent', 'missingCheckout', 'leaveDays']) totals[key] += row[key];
    if (row.attendanceMinutes != null) totals.attendanceMinutes = (totals.attendanceMinutes || 0) + row.attendanceMinutes;
  }
  const pageCount = Math.max(1, Math.ceil(rows.length / ctx.q.pageSize)), page = Math.min(ctx.q.page, pageCount);
  return { scope: ctx.access.scope, permissions: ctx.access.reportPermissions, timezone: ctx.timezone, asOf: ctx.now,
    filters: { departments: ctx.departments.filter(d => d.isActive !== false).map(d => ({ _id: d._id, name: d.name })), statuses: TEAM_STATUSES, workModes: TEAM_WORK_MODES },
    query: ctx.q, totals, pagination: { page, pageSize: ctx.q.pageSize, total: rows.length, pageCount },
    rows: rows.slice((page - 1) * ctx.q.pageSize, page * ctx.q.pageSize),
    coverageNotice: 'Day counts reflect recorded attendance results. Work time reflects authorized Time Tracking records. Missing records are not absences. Rates require complete historical coverage.' };
}

async function subjectContext(args) {
  const ctx = await prepare({ ...args, historicalSubject: true, query: { ...args.query, userId: args.userId, search: '', status: '', workMode: '', departmentId: args.query?.departmentId || '' } });
  if (!ctx.subjects.length) throw new ErrorResponse('Attendance subject not found', 404);
  return ctx;
}

function missingCalendarDay(ctx, workDateKey, calendar) {
  const primary = ctx.subjects[0].primaryDepartmentId;
  const instant = dateOnlyToInstant(workDateKey, ctx.timezone);
  // The legacy calendar helper accepts a workspace-wide holiday context. Narrow
  // it to the subject before classification; another department's holiday (or
  // an unresolvable location holiday) cannot establish this member's day type.
  if (calendar) calendar = { ...calendar, holidaysByDateKey: new Map([...calendar.holidaysByDateKey].map(([key, holidays]) => [key, holidays.filter(h => h.scope === 'workspace' || h.scope === 'department' && (h.departmentIds || []).some(department => id(department) === id(primary)))]).filter(([, holidays]) => holidays.length)) };
  const configured = calendar && (calendar.workspaceCalendars.some(c => +new Date(c.effectiveFrom) <= +instant) ||
    calendar.departmentCalendars.some(c => id(c.departmentId) === id(primary) && +new Date(c.effectiveFrom) <= +instant) ||
    calendar.overridesByDateKey.has(workDateKey) || calendar.holidaysByDateKey.has(workDateKey) || calendar.holidaysByDateKey.has(`*-${workDateKey.slice(5)}`));
  const classification = configured ? classifyDateWithContext(calendar, instant, primary) : null;
  return { workDateKey, hasAttendance: false, displayStatus: classification && !classification.isWorkingDay ? classification.dayType === 'HOLIDAY' ? 'HOLIDAY' : 'WEEKLY_OFF' : workDateKey > ctx.today ? 'FUTURE' : 'UNKNOWN',
    calendarDayType: classification?.dayType || null, calendarSource: classification ? 'CURRENT_CONFIGURATION' : null, workedMinutes: null };
}

export async function getTeamAttendanceMonth(args) {
  if (typeof args.month !== 'string' || !/^\d{4}-\d{2}$/.test(args.month) || !DateTime.fromISO(`${args.month}-01`).isValid) throw new ErrorResponse('Invalid attendance month', 400);
  const month = DateTime.fromISO(`${args.month}-01`), startDate = month.toISODate(), endDate = month.endOf('month').toISODate();
  const ctx = await subjectContext({ ...args, query: { ...args.query, startDate, endDate } });
  const records = await AttendanceDay.aggregate(teamDayPipeline({ ...ctx, userIds: [args.userId], startDate, endDate })).option(queryOptions);
  const map = new Map(records.map(record => [record.workDateKey, record]));
  const calendar = endDate >= ctx.today ? await buildCalendarContext({ timezone: ctx.timezone, departmentIds: [ctx.subjects[0].primaryDepartmentId].filter(Boolean), startDate, endDate }) : null;
  const days = [];
  for (let date = month; date.toISODate() <= endDate; date = date.plus({ days: 1 })) {
    const workDateKey = date.toISODate(), record = map.get(workDateKey);
    if (record) {
      const { leaveTypes: _, policyVersion: __, ...publicDay } = record;
      days.push({ ...publicDay, calendarSource: record.hasAttendance ? 'ATTENDANCE_SNAPSHOT' : 'APPROVED_LEAVE_SNAPSHOT' });
    } else {
      days.push(missingCalendarDay(ctx, workDateKey, workDateKey >= ctx.today ? calendar : null));
    }
  }
  const sessions = await AttendanceSession.find({ workspaceId: args.workspaceId, user: args.userId, workDateKey: { $gte: startDate, $lte: endDate } }).select('workDateKey status checkInAt checkOutAt missedCheckoutCutoffAt regularizationResolution').lean();
  const sessionsByDay = new Map();
  for (const session of sessions) { const list = sessionsByDay.get(session.workDateKey) || []; list.push(effectiveAttendanceSession(session)); sessionsByDay.set(session.workDateKey, list); }
  for (const day of days) {
    const daySessions = sessionsByDay.get(day.workDateKey) || [];
    day.activeSession = daySessions.some(s => s.status === 'ACTIVE' && (!s.missedCheckoutCutoffAt || +s.missedCheckoutCutoffAt > +ctx.now));
    if (day.hasAttendance && day.activeSession) { day.workedMinutes = Math.round(intervalMinutes(attendanceIntervals(daySessions, ctx.now))); day.durationIsLive = true; }
  }
  const work = await readAttendanceWork({ ...ctx, userIds: [args.userId], startDate, endDate });
  for (const day of days) day.trackedWork = work.get(id(args.userId) + ':' + day.workDateKey) || unavailableWork();
  return { user: ctx.subjects[0].user, departments: ctx.subjects[0].departments, timezone: ctx.timezone, month: args.month, asOf: ctx.now, days };
}

async function trackedDay(ctx, userId, workDateKey) {
  const work = await readAttendanceWork({ ...ctx, userIds: [userId], startDate: workDateKey, endDate: workDateKey });
  return work.get(id(userId) + ':' + workDateKey) || unavailableWork();
}

export async function getTeamAttendanceDay(args) {
  const ctx = await subjectContext({ ...args, query: { ...args.query, startDate: args.workDateKey, endDate: args.workDateKey } });
  const filter = { workspaceId: args.workspaceId, user: args.userId, workDateKey: args.workDateKey };
  const [records, sessions, regularizations, leaveScope] = await Promise.all([
    AttendanceDay.aggregate(teamDayPipeline({ ...ctx, userIds: [args.userId], startDate: args.workDateKey, endDate: args.workDateKey })).option(queryOptions),
    AttendanceSession.find(filter).select('_id status checkInAt checkOutAt effectiveShiftEndAt missedCheckoutCutoffAt regularizationResolution regularizationStatus').lean(),
    AttendanceRegularization.find({ workspaceId: args.workspaceId, requester: args.userId, workDateKey: args.workDateKey }).select('attendanceSession status type appliedAt decidedAt finalCorrection').lean(),
    resolveLeaveAccessScope({ viewer: args.viewer, workspaceId: args.workspaceId })
  ]);
  const approved = regularizations.filter(r => r.status === 'APPROVED' && r.appliedAt);
  const effective = applyRegularizationOverlay({ sessions, approvedRegularizations: approved });
  const requests = await LeaveRequest.find({ $and: [leaveScope.requestFilter, { workspaceId: args.workspaceId, requester: args.userId, status: { $in: APPROVED_STATUSES } }] }).select('_id leaveType').lean();
  const [leaveDays, leaveTypes, trackedWork] = await Promise.all([
    LeaveRequestDay.find({ workspaceId: args.workspaceId, request: { $in: requests.map(r => r._id) }, date: dateOnlyToInstant(args.workDateKey, ctx.timezone) }).select('request dayType isConsuming shortLeaveStartTime shortLeaveEndTime shortLeaveDurationMinutes').lean(),
    LeaveType.find({ workspaceId: args.workspaceId, _id: { $in: requests.map(r => r.leaveType) } }).select('name').lean(),
    trackedDay(ctx, args.userId, args.workDateKey)
  ]);
  const calendar = !records.length && args.workDateKey >= ctx.today ? await buildCalendarContext({ timezone: ctx.timezone, departmentIds: [ctx.subjects[0].primaryDepartmentId].filter(Boolean), startDate: args.workDateKey, endDate: args.workDateKey }) : null;
  const { leaveTypes: _, policyVersion, ...day } = records[0] || missingCalendarDay(ctx, args.workDateKey, calendar);
  day.activeSession = effective.some(s => s.status === 'ACTIVE' && (!s.missedCheckoutCutoffAt || +s.missedCheckoutCutoffAt > +ctx.now));
  if (day.hasAttendance && day.activeSession) { day.workedMinutes = Math.round(intervalMinutes(attendanceIntervals(effective, ctx.now))); day.durationIsLive = true; }
  const policy = policyVersion ? await AttendancePolicyVersion.findOne({ workspaceId: args.workspaceId, _id: policyVersion }).select('name versionNumber').lean() : null;
  return { user: ctx.subjects[0].user, timezone: ctx.timezone, asOf: ctx.now, day,
    schedule: { startLocalTime: day.effectiveOfficeHoursStart || null, endLocalTime: day.effectiveOfficeHoursEnd || null, source: day.effectiveOfficeHoursSource || null,
      recordedEndAt: sessions.map(s => s.effectiveShiftEndAt).filter(Boolean).sort((a, b) => +b - +a)[0] || null,
      expectedMinutes: day.hasAttendance ? day.shiftExpectedMinutes : null, policyVersion: policy?.versionNumber || null },
    sessions: effective.map(s => ({ status: s.status, checkInAt: s.checkInAt, checkOutAt: s.checkOutAt, regularized: !!s.regularized, regularizationStatus: s.regularizationStatus || null })),
    regularizations: regularizations.map(r => ({ status: r.status, type: r.type, appliedAt: r.appliedAt || null })),
    approvedLeaves: leaveDays.map(d => { const request = requests.find(r => id(r) === id(d.request)); return { dayType: d.dayType, isConsuming: d.isConsuming,
      type: leaveTypes.find(t => id(t) === id(request?.leaveType))?.name || null, startLocalTime: d.shortLeaveStartTime, endLocalTime: d.shortLeaveEndTime, durationMinutes: d.shortLeaveDurationMinutes }; }), trackedWork };
}

export async function exportTeamAttendance(args, response) {
  const ctx = await prepare(args);
  if (!ctx.access.reportPermissions.canViewReports) throw new ErrorResponse('Attendance report permission required', 403);
  const format = args.query?.format || 'summary';
  if (!['summary', 'daily'].includes(format)) throw new ErrorResponse('Invalid attendance export format', 400);
  const rows = await summaryRows(ctx);
  response.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="attendance-${format}-${ctx.q.startDate}-to-${ctx.q.endDate}.csv"`, 'Cache-Control': 'private, no-store' });
  const write = async values => {
    if (response.destroyed) return;
    if (!response.write(csvLine(values))) await new Promise(resolve => {
      const done = () => { response.removeListener('drain', done); response.removeListener('close', done); resolve(); };
      response.once('drain', done); response.once('close', done);
    });
  };
  if (format === 'summary') {
    await write(['Employee', 'Email', 'Department', 'Present days', 'Half days', 'Absent days', 'Missing checkout', 'Full leave days', 'Attendance minutes', 'Full-period attendance %', 'Rate availability', 'Work seconds']);
    for (const row of rows) { if (response.destroyed) break; await write([row.user.name, row.user.email, row.departments.map(d => d.name).join('; '), row.present, row.halfDays, row.absent, row.missingCheckout, row.leaveDays, row.attendanceMinutes ?? 'N/A', row.attendanceRate.value ?? 'N/A', row.attendanceRate.reason, row.workSeconds ?? 'N/A']); }
  } else {
    await write(['Employee', 'Date', 'Work mode', 'Worked hours', 'Status', 'Tracked work hours']);
    const tracked = await readAttendanceWork({ ...ctx, userIds: rows.map(row => row.user._id), startDate: ctx.q.startDate, endDate: ctx.q.endDate });
    const names = new Map(rows.map(row => [id(row.user), row.user.name]));
    const pipeline = teamDayPipeline({ ...ctx, userIds: rows.map(row => row.user._id), startDate: ctx.q.startDate, endDate: ctx.q.endDate });
    if (ctx.q.status) pipeline.push({ $match: { displayStatus: ctx.q.status } });
    if (ctx.q.workMode) pipeline.push({ $match: { workMode: ctx.q.workMode } });
    pipeline.push(...sessionFactsStages(ctx), { $sort: { workDateKey: -1, user: 1 } });
    const cursor = AttendanceDay.aggregate(pipeline).option(queryOptions).cursor({ batchSize: 250 });
    try { for await (const day of cursor) { if (response.destroyed) break; await write([names.get(id(day.user)), day.workDateKey, day.workMode, day.hasAttendance && Number.isFinite(day.workedMinutes) ? day.workedMinutes / 60 : 'N/A', day.displayStatus, tracked.get(id(day.user) + ':' + day.workDateKey)?.seconds == null ? 'N/A' : tracked.get(id(day.user) + ':' + day.workDateKey).seconds / 3600]); } } finally { await cursor.close(); }
  }
  response.end();
}
