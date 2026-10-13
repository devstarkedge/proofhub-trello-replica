import { validateDateRange } from '../../utils/calendarDateRange.js';
import asyncHandler from '../../middleware/asyncHandler.js';
import Workspace from '../../models/Workspace.js';
import { getLeaveCalendarEvents } from './leaveRead.service.js';
import { dateOnlyToInstant, getWorkspaceTimezone, instantToDateOnlyKey } from './leaveTimezone.util.js';

import { ErrorResponse } from '../../middleware/errorHandler.js';
import WorkCalendar from './workCalendar.model.js';
import Holiday from './holiday.model.js';
import Department from '../../models/Department.js';
import { recordAuditLog } from '../permissions/auditLogService.js';
import { onWorkCalendarUpdated } from './leaveHooks.js';
import * as workCalendarSettingsService from './workCalendarSettings.service.js';

export const listLeaveEvents = asyncHandler(async (req, res) => {
  const data = await getLeaveCalendarEvents({ viewer: req.user, workspaceId: req.workspaceId, startDate: req.query.startDate, endDate: req.query.endDate });
  res.json({ success: true, data });
});
export const listWorkCalendars = asyncHandler(async (req, res) => {
  const calendars = await WorkCalendar.find({ isActive: true }).sort({ scope: 1, effectiveFrom: -1 }).lean();
  res.json({ success: true, data: calendars });
});

export const upsertWorkCalendar = asyncHandler(async (req, res) => {
  const { scope = 'workspace', departmentId = null, weeklyPattern, effectiveFrom } = req.body;
  if (scope === 'department' && !departmentId) throw new ErrorResponse('departmentId is required for a department-scoped calendar', 400);
  if (departmentId) {
    const department = await Department.findOne({ _id: departmentId, workspaceId: req.workspaceId }).select('_id').lean();
    if (!department) throw new ErrorResponse('Department not found in this workspace', 404);
  }

  const calendar = await WorkCalendar.create({
    workspaceId: req.workspaceId, scope, departmentId: scope === 'department' ? departmentId : null,
    weeklyPattern, effectiveFrom: effectiveFrom || new Date(), createdBy: req.user.id
  });
  await recordAuditLog({
    actor: req.user, action: 'LEAVE_WORK_CALENDAR_CREATED', targetType: 'WorkCalendar', targetId: calendar._id,
    resourceLabel: `Work Calendar (${scope})`, summary: `${req.user.name} updated the working-day calendar (${scope})`,
    before: null, after: calendar.toObject(), category: 'leave_management', meta: { workspaceId: req.workspaceId }
  });
  onWorkCalendarUpdated(req.workspaceId).catch(() => {});
  res.status(201).json({ success: true, data: calendar });
});

export const listHolidays = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const filter = {};
  const workspace = await Workspace.findById(req.workspaceId).select('timezone').lean();
  const timezone = getWorkspaceTimezone(workspace);
  if (startDate || endDate) {
    validateDateRange(startDate || endDate, endDate || startDate);
    const date = { ...(startDate ? { $gte: dateOnlyToInstant(startDate, timezone) } : {}), ...(endDate ? { $lte: dateOnlyToInstant(endDate, timezone) } : {}) };
    if (req.query.includeRecurring === 'true') filter.$or = [{ date }, { recurrenceRule: 'ANNUAL_SAME_DATE' }];
    else filter.date = date;
  }
  const today = instantToDateOnlyKey(new Date(), timezone);
  const holidays = (await Holiday.find({ ...filter, workspaceId: req.workspaceId }).sort({ date: 1 }).lean())
    .map((h) => ({ ...h, dateKey: instantToDateOnlyKey(h.date, timezone), canDelete: instantToDateOnlyKey(h.date, timezone) < today }));
  res.json({ success: true, data: holidays });
});

export const createHoliday = asyncHandler(async (req, res) => {
  const { date, name, type, isHalfDay, scope, departmentIds, locationTag, recurrenceRule } = req.body;
  if (!date || !name) throw new ErrorResponse('date and name are required', 400);
  const workspace = await Workspace.findById(req.workspaceId).select('timezone').lean();
  const timezone = getWorkspaceTimezone(workspace);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new ErrorResponse('Choose a valid holiday date', 400);
  if (departmentIds?.length) {
    const count = await Department.countDocuments({ _id: { $in: departmentIds }, workspaceId: req.workspaceId });
    if (count !== new Set(departmentIds.map(String)).size) throw new ErrorResponse('Department not found in this workspace', 400);
  }
  const holiday = await Holiday.create({
    workspaceId: req.workspaceId, date: dateOnlyToInstant(date, timezone), name, type, isHalfDay, scope, departmentIds, locationTag, recurrenceRule,
    createdBy: req.user.id
  });
  await recordAuditLog({
    actor: req.user, action: 'LEAVE_HOLIDAY_CREATED', targetType: 'Holiday', targetId: holiday._id,
    resourceLabel: `Holiday: ${holiday.name}`, summary: `${req.user.name} added holiday "${holiday.name}"`,
    before: null, after: holiday.toObject(), category: 'leave_management', meta: { workspaceId: req.workspaceId }
  });
  onWorkCalendarUpdated(req.workspaceId).catch(() => {});
  res.status(201).json({ success: true, data: holiday });
});

export const deleteHoliday = asyncHandler(async (req, res) => {
  const workspace = await Workspace.findById(req.workspaceId).select('timezone').lean();
  const timezone = getWorkspaceTimezone(workspace);
  const today = instantToDateOnlyKey(new Date(), timezone);
  const holiday = await Holiday.findOne({ _id: req.params.holidayId, workspaceId: req.workspaceId });
  if (!holiday) throw new ErrorResponse('Holiday not found', 404);
  if (instantToDateOnlyKey(holiday.date, timezone) >= today) throw new ErrorResponse('A holiday can only be deleted after its workspace-local calendar date has passed', 400);
  const deleted = await Holiday.deleteOne({ _id: holiday._id, workspaceId: req.workspaceId, date: holiday.date });
  if (!deleted.deletedCount) throw new ErrorResponse('Holiday changed concurrently; refresh and retry', 409);
  await recordAuditLog({
    actor: req.user, action: 'LEAVE_HOLIDAY_DELETED', targetType: 'Holiday', targetId: holiday._id,
    resourceLabel: `Holiday: ${holiday.name}`, summary: `${req.user.name} removed holiday "${holiday.name}"`,
    before: holiday.toObject(), after: null, category: 'leave_management', meta: { workspaceId: req.workspaceId }
  });
  onWorkCalendarUpdated(req.workspaceId).catch(() => {});
  res.json({ success: true, data: { deleted: true } });
});

// ─── Work Calendar Engine — base pattern + recurring rules + date
//     overrides, read/saved/previewed as one atomic unit ────────────────

export const getWorkCalendarConfig = asyncHandler(async (req, res) => {
  const config = await workCalendarSettingsService.getWorkCalendarConfiguration({ workspaceId: req.workspaceId });
  res.json({ success: true, data: config });
});

export const saveWorkCalendarConfig = asyncHandler(async (req, res) => {
  const { effectiveFrom, weeklyPattern, standardWorkMinutesPerDay, recurringRules, dateOverrides } = req.body;
  const { before, after } = await workCalendarSettingsService.saveWorkCalendarConfiguration({
    workspaceId: req.workspaceId, effectiveFrom, weeklyPattern, standardWorkMinutesPerDay,
    recurringRules, dateOverrides, createdBy: req.user.id
  });

  await recordAuditLog({
    actor: req.user, action: 'LEAVE_WORK_CALENDAR_CONFIGURED', targetType: 'WorkCalendar',
    targetId: after.workCalendar?._id, resourceLabel: 'Work Calendar',
    summary: `${req.user.name} updated the workspace Work Calendar (base pattern, recurring rules, and date overrides)`,
    before, after, category: 'leave_management', meta: { workspaceId: req.workspaceId }
  });
  onWorkCalendarUpdated(req.workspaceId).catch(() => {});
  res.json({ success: true, data: after });
});

export const previewWorkCalendarConfig = asyncHandler(async (req, res) => {
  const { year, month, weeklyPattern, standardWorkMinutesPerDay, recurringRules, dateOverrides } = req.body;
  if (!year || !month) throw new ErrorResponse('year and month are required', 400);
  const preview = await workCalendarSettingsService.previewWorkCalendarConfiguration({
    workspaceId: req.workspaceId, year, month, weeklyPattern, standardWorkMinutesPerDay, recurringRules, dateOverrides
  });
  res.json({ success: true, data: preview });
});
