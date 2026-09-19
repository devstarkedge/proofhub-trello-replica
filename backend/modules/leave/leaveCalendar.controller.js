import asyncHandler from '../../middleware/asyncHandler.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import WorkCalendar from './workCalendar.model.js';
import Holiday from './holiday.model.js';
import Department from '../../models/Department.js';
import { recordAuditLog } from '../permissions/auditLogService.js';
import { onWorkCalendarUpdated } from './leaveHooks.js';
import * as workCalendarSettingsService from './workCalendarSettings.service.js';

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
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = new Date(startDate);
    if (endDate) filter.date.$lte = new Date(endDate);
  }
  const holidays = await Holiday.find(filter).sort({ date: 1 }).lean();
  res.json({ success: true, data: holidays });
});

export const createHoliday = asyncHandler(async (req, res) => {
  const { date, name, type, isHalfDay, scope, departmentIds, locationTag, recurrenceRule } = req.body;
  if (!date || !name) throw new ErrorResponse('date and name are required', 400);
  const holiday = await Holiday.create({
    workspaceId: req.workspaceId, date, name, type, isHalfDay, scope, departmentIds, locationTag, recurrenceRule,
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
  const holiday = await Holiday.findOneAndDelete({ _id: req.params.holidayId, workspaceId: req.workspaceId });
  if (!holiday) throw new ErrorResponse('Holiday not found', 404);
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
