import mongoose from 'mongoose';
import { ErrorResponse } from '../../middleware/errorHandler.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;
const ID_FIELDS = ['departmentId', 'managerId', 'teamId', 'employeeId', 'projectId'];
const TEXT_FIELDS = ['status', 'priority', 'billingType', 'client', 'taskView'];
const TASK_VIEWS = ['all', 'active', 'completed', 'pending', 'in-progress', 'review', 'blocked', 'overdue'];

const startOfDay = (date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const endOfDay = (date) => {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
};

const getPresetRange = (preset, now = new Date()) => {
  const today = startOfDay(now);
  const endToday = endOfDay(now);
  const weekday = (today.getDay() + 6) % 7;
  const thisWeek = new Date(today.getTime() - weekday * DAY_MS);
  const currentQuarter = Math.floor(today.getMonth() / 3) * 3;
  const presets = {
    today: [today, endToday],
    yesterday: [new Date(today.getTime() - DAY_MS), new Date(today.getTime() - 1)],
    this_week: [thisWeek, endToday],
    last_week: [new Date(thisWeek.getTime() - 7 * DAY_MS), new Date(thisWeek.getTime() - 1)],
    this_month: [new Date(today.getFullYear(), today.getMonth(), 1), endToday],
    last_month: [new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999)],
    quarter: [new Date(today.getFullYear(), currentQuarter, 1), endToday],
    year: [new Date(today.getFullYear(), 0, 1), endToday],
    last_30_days: [new Date(today.getTime() - 29 * DAY_MS), endToday],
  };
  return presets[preset] || presets.last_30_days;
};

export const parseAnalyticsFilters = (query = {}, now = new Date()) => {
  const preset = String(query.range || 'last_30_days').toLowerCase();
  let [startDate, endDate] = getPresetRange(preset, now);

  if (preset === 'custom') {
    startDate = startOfDay(query.startDate);
    endDate = endOfDay(query.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new ErrorResponse('A valid startDate and endDate are required for a custom range', 400);
    }
  }

  if (startDate > endDate) throw new ErrorResponse('startDate must be before endDate', 400);
  if ((endDate - startDate) / DAY_MS > MAX_RANGE_DAYS) {
    throw new ErrorResponse(`Analytics date range cannot exceed ${MAX_RANGE_DAYS} days`, 400);
  }

  const filters = { range: preset, startDate, endDate };
  for (const field of ID_FIELDS) {
    if (!query[field]) continue;
    if (!mongoose.isValidObjectId(query[field])) throw new ErrorResponse(`${field} is invalid`, 400);
    filters[field] = String(query[field]);
  }
  for (const field of TEXT_FIELDS) {
    if (!query[field]) continue;
    const value = String(query[field]).trim().slice(0, 80);
    if (value) filters[field] = value;
  }
  if (filters.billingType && !['hr', 'hourly', 'fixed', 'milestone'].includes(filters.billingType.toLowerCase())) {
    throw new ErrorResponse('billingType must be hourly, fixed, or milestone', 400);
  }
  if (filters.taskView) {
    filters.taskView = filters.taskView.toLowerCase();
    if (!TASK_VIEWS.includes(filters.taskView)) {
      throw new ErrorResponse(`taskView must be one of: ${TASK_VIEWS.join(', ')}`, 400);
    }
  }
  return filters;
};

export const analyticsRangeMeta = (filters) => ({
  preset: filters.range,
  startDate: filters.startDate.toISOString(),
  endDate: filters.endDate.toISOString(),
  days: Math.max(1, Math.ceil((filters.endDate - filters.startDate) / DAY_MS)),
});
