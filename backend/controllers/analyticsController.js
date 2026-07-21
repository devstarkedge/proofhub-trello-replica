import mongoose from 'mongoose';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import { parseAnalyticsFilters } from '../services/analytics/analyticsFilters.js';
import { getAnalyticsTaskList, getDashboardAnalytics, getEmployeeAssignedTasks } from '../services/analytics/analyticsService.js';

const dashboard = async (req) => getDashboardAnalytics(req.user, parseAnalyticsFilters(req.query));

export const getAnalyticsDashboard = asyncHandler(async (req, res) => {
  const data = await dashboard(req);
  res.status(200).set('Cache-Control', 'no-store').json({ success: true, data });
});

// Compatibility endpoint for older clients, backed by the same secure service.
export const getDepartmentAnalytics = asyncHandler(async (req, res) => {
  const query = { ...req.query };
  if (req.params.departmentId !== 'all') query.departmentId = req.params.departmentId;
  const data = await getDashboardAnalytics(req.user, parseAnalyticsFilters(query));
  const { tasks, time } = data.kpis;
  res.status(200).set('Cache-Control', 'no-store').json({ success: true, data: {
    departmentId: req.params.departmentId,
    departmentName: req.params.departmentId === 'all' ? 'All Departments' : data.filters.departments.find((department) => department.id.toString() === req.params.departmentId)?.name || 'Department',
    totalTasks: tasks.total, completedTasks: tasks.completed, inProgressTasks: tasks.inProgress,
    todoTasks: tasks.pending, reviewTasks: tasks.review, overdueTasks: tasks.overdue,
    completionRate: tasks.completionRate, avgCompletionTime: tasks.averageCompletionDays,
    priorityBreakdown: Object.fromEntries(data.charts.priority.map((item) => [item.name, item.value])),
    timeAnalytics: { totalEstimatedHours: time.estimatedHours, totalLoggedHours: time.loggedHours, timeVariance: time.varianceHours },
    projectBreakdown: data.projects.map((project) => ({ id: project.id, name: project.name, totalTasks: project.totalTasks, completedTasks: project.completedTasks, progress: project.progress, status: project.status })),
    overdueTasksList: data.attention,
  } });
});

export const getProjectsAnalytics = asyncHandler(async (req, res) => {
  const query = { ...req.query };
  if (req.params.departmentId !== 'all') query.departmentId = req.params.departmentId;
  const data = await getDashboardAnalytics(req.user, parseAnalyticsFilters(query));
  res.status(200).set('Cache-Control', 'no-store').json({ success: true, data: data.projects });
});

export const getUserAnalytics = asyncHandler(async (req, res) => {
  const data = await getDashboardAnalytics(req.user, parseAnalyticsFilters({ ...req.query, employeeId: req.params.userId }));
  const employee = data.employees.find((item) => item.id.toString() === req.params.userId);
  res.status(200).set('Cache-Control', 'no-store').json({ success: true, data: employee || {
    userId: req.params.userId, assignedTasks: 0, completedTasks: 0,
    pendingTasks: 0, overdueTasks: 0, completionRate: 0, loggedHours: 0,
  } });
});

export const getEmployeeAnalyticsTasks = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.employeeId)) throw new ErrorResponse('Invalid employee id', 400);
  const filters = parseAnalyticsFilters(req.query);
  const data = await getEmployeeAssignedTasks(req.user, req.params.employeeId, filters, req.query);
  res.status(200).set('Cache-Control', 'no-store').json({ success: true, data });
});

export const getAnalyticsTasks = asyncHandler(async (req, res) => {
  const filters = parseAnalyticsFilters(req.query);
  const data = await getAnalyticsTaskList(req.user, filters, req.query);
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ success: true, data });
});
