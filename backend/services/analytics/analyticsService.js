import mongoose from 'mongoose';
import Card from '../../models/Card.js';
import Team from '../../models/Team.js';
import User from '../../models/User.js';
import Activity from '../../models/Activity.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { analyticsRangeMeta } from './analyticsFilters.js';
import {
  ANALYTICS_ROLES,
  assertScopeFilter,
  canonicalBillingType,
  filterScopedBoards,
  resolveAnalyticsScope,
  scopeBoardsToEmployeeProjects,
} from './analyticsScope.js';

const id = (value) => value?._id?.toString() || value?.toString();
const oid = (value) => new mongoose.Types.ObjectId(value);
const round = (value, digits = 1) => Number((Number(value) || 0).toFixed(digits));
const percent = (numerator, denominator) => denominator > 0 ? round((numerator / denominator) * 100, 1) : 0;
const HOURS = 60;
const DONE_STATUSES = ['done', 'completed', 'complete'];
const CANCELLED_STATUSES = ['cancelled', 'canceled'];
const IN_PROGRESS_STATUSES = ['in-progress', 'in progress', 'in_progress', 'active'];

const analyticsListWindow = (pagination = {}) => {
  const limit = Math.min(50, Math.max(5, Number.parseInt(pagination.limit, 10) || 30));
  const requestedOffset = Number.parseInt(pagination.offset, 10);
  const page = Math.max(1, Number.parseInt(pagination.page, 10) || 1);
  const offset = Number.isFinite(requestedOffset) && requestedOffset >= 0
    ? requestedOffset
    : (page - 1) * limit;
  return { limit, offset };
};

const sumTimeEntries = (field, filters, userId = null) => ({
  $sum: {
    $map: {
      input: {
        $filter: {
          input: { $ifNull: [`$${field}`, []] },
          as: 'entry',
          cond: {
            $and: [
              { $gte: [{ $ifNull: ['$$entry.date', '$createdAt'] }, filters.startDate] },
              { $lte: [{ $ifNull: ['$$entry.date', '$createdAt'] }, filters.endDate] },
              ...(userId ? [{ $eq: ['$$entry.user', userId] }] : []),
            ],
          },
        },
      },
      as: 'entry',
      in: { $add: [{ $multiply: [{ $ifNull: ['$$entry.hours', 0] }, 60] }, { $ifNull: ['$$entry.minutes', 0] }] },
    },
  },
});

const emptyFacet = () => ({
  totals: [], status: [], priority: [], createdTrend: [], completedTrend: [], timeTrend: [],
  projects: [], employeeTasks: [], employeeTime: [], employeeEstimation: [], recentOverdue: [],
});

const normalizeStatus = { $toLower: { $trim: { input: { $ifNull: ['$status', 'pending'] } } } };

const applyTaskViewMatch = (match, filters) => {
  const taskView = String(filters.taskView || 'all').toLowerCase();
  if (taskView === 'all') return match;

  const terminalStatuses = [...DONE_STATUSES, ...CANCELLED_STATUSES];
  const pendingExclusions = [...terminalStatuses, ...IN_PROGRESS_STATUSES, 'review', 'blocked'];
  const expressions = {
    active: { $not: [{ $in: [normalizeStatus, terminalStatuses] }] },
    completed: { $in: [normalizeStatus, DONE_STATUSES] },
    pending: { $not: [{ $in: [normalizeStatus, pendingExclusions] }] },
    'in-progress': { $in: [normalizeStatus, IN_PROGRESS_STATUSES] },
    review: { $eq: [normalizeStatus, 'review'] },
    blocked: { $eq: [normalizeStatus, 'blocked'] },
    overdue: { $not: [{ $in: [normalizeStatus, terminalStatuses] }] },
  };

  match.$expr = expressions[taskView];
  if (taskView === 'overdue') {
    const effectiveNow = filters.endDate < new Date() ? filters.endDate : new Date();
    match.dueDate = { $ne: null, $lt: effectiveNow };
  }
  return match;
};

const buildCardPipeline = (boardIds, filters, scope) => {
  const match = {
    board: { $in: boardIds },
    isArchived: { $ne: true },
    createdAt: { $lte: filters.endDate },
  };
  if (scope.personalOnly) match.assignees = scope.userId;
  if (filters.employeeId) match.assignees = oid(filters.employeeId);
  if (filters.status) match.status = new RegExp(`^${filters.status.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  if (filters.priority) match.priority = filters.priority.toLowerCase();

  const effectiveNow = filters.endDate < new Date() ? filters.endDate : new Date();
  const selectedUserId = scope.personalOnly ? scope.userId : (filters.employeeId ? oid(filters.employeeId) : null);
  const isDone = { $in: ['$normalizedStatus', DONE_STATUSES] };
  const isCancelled = { $in: ['$normalizedStatus', CANCELLED_STATUSES] };
  const isOverdue = {
    $and: [
      { $ne: ['$dueDate', null] },
      { $lt: ['$dueDate', effectiveNow] },
      { $not: [isDone] },
      { $not: [isCancelled] },
    ],
  };

  return [
    { $match: match },
    {
      $set: {
        normalizedStatus: normalizeStatus,
        estimatedMinutes: sumTimeEntries('estimationTime', filters, selectedUserId),
        loggedMinutes: sumTimeEntries('loggedTime', filters, selectedUserId),
        billedMinutes: sumTimeEntries('billedTime', filters, selectedUserId),
      },
    },
    {
      $facet: {
        totals: [{
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: { $sum: { $cond: [isDone, 1, 0] } },
            cancelled: { $sum: { $cond: [isCancelled, 1, 0] } },
            inProgress: { $sum: { $cond: [{ $in: ['$normalizedStatus', IN_PROGRESS_STATUSES] }, 1, 0] } },
            review: { $sum: { $cond: [{ $eq: ['$normalizedStatus', 'review'] }, 1, 0] } },
            blocked: { $sum: { $cond: [{ $eq: ['$normalizedStatus', 'blocked'] }, 1, 0] } },
            overdue: { $sum: { $cond: [isOverdue, 1, 0] } },
            currentCreated: { $sum: { $cond: [{ $and: [{ $gte: ['$createdAt', filters.startDate] }, { $lte: ['$createdAt', filters.endDate] }] }, 1, 0] } },
            estimatedMinutes: { $sum: '$estimatedMinutes' },
            loggedMinutes: { $sum: '$loggedMinutes' },
            billedMinutes: { $sum: '$billedMinutes' },
            completionMs: {
              $sum: { $cond: [{ $and: [isDone, { $ne: ['$startDate', null] }] }, { $max: [0, { $subtract: ['$updatedAt', '$startDate'] }] }, 0] },
            },
            completionSamples: { $sum: { $cond: [{ $and: [isDone, { $ne: ['$startDate', null] }] }, 1, 0] } },
            activeAgeMs: { $sum: { $cond: [{ $and: [{ $not: [isDone] }, { $not: [isCancelled] }] }, { $max: [0, { $subtract: [effectiveNow, '$createdAt'] }] }, 0] } },
            activeAgeSamples: { $sum: { $cond: [{ $and: [{ $not: [isDone] }, { $not: [isCancelled] }] }, 1, 0] } },
          },
        }],
        status: [{ $group: { _id: '$normalizedStatus', value: { $sum: 1 } } }, { $sort: { value: -1 } }],
        priority: [{ $group: { _id: { $ifNull: ['$priority', 'unassigned'] }, value: { $sum: 1 } } }, { $sort: { value: -1 } }],
        createdTrend: [
          { $match: { createdAt: { $gte: filters.startDate, $lte: filters.endDate } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, created: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
        completedTrend: [
          { $match: { normalizedStatus: { $in: DONE_STATUSES }, updatedAt: { $gte: filters.startDate, $lte: filters.endDate } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } }, completed: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
        timeTrend: [
          { $unwind: { path: '$loggedTime', preserveNullAndEmptyArrays: false } },
          { $match: { 'loggedTime.date': { $gte: filters.startDate, $lte: filters.endDate }, ...(selectedUserId ? { 'loggedTime.user': selectedUserId } : {}) } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$loggedTime.date' } }, minutes: { $sum: { $add: [{ $multiply: ['$loggedTime.hours', 60] }, '$loggedTime.minutes'] } } } },
          { $sort: { _id: 1 } },
        ],
        projects: [{
          $group: {
            _id: '$board',
            totalTasks: { $sum: 1 },
            completedTasks: { $sum: { $cond: [isDone, 1, 0] } },
            overdueTasks: { $sum: { $cond: [isOverdue, 1, 0] } },
            loggedMinutes: { $sum: '$loggedMinutes' },
            estimatedMinutes: { $sum: '$estimatedMinutes' },
          },
        }],
        employeeTasks: [
          { $unwind: '$assignees' },
          ...(selectedUserId ? [{ $match: { assignees: selectedUserId } }] : []),
          { $group: {
            _id: '$assignees', totalTasks: { $sum: 1 },
            completedTasks: { $sum: { $cond: [isDone, 1, 0] } },
            overdueTasks: { $sum: { $cond: [isOverdue, 1, 0] } },
            pendingTasks: { $sum: { $cond: [{ $and: [{ $not: [isDone] }, { $not: [isCancelled] }] }, 1, 0] } },
            completionMs: { $sum: { $cond: [{ $and: [isDone, { $ne: ['$startDate', null] }] }, { $max: [0, { $subtract: ['$updatedAt', '$startDate'] }] }, 0] } },
            completionSamples: { $sum: { $cond: [{ $and: [isDone, { $ne: ['$startDate', null] }] }, 1, 0] } },
            activeAgeMs: { $sum: { $cond: [{ $and: [{ $not: [isDone] }, { $not: [isCancelled] }] }, { $max: [0, { $subtract: [effectiveNow, '$createdAt'] }] }, 0] } },
            activeAgeSamples: { $sum: { $cond: [{ $and: [{ $not: [isDone] }, { $not: [isCancelled] }] }, 1, 0] } },
          } },
        ],
        employeeTime: [
          { $unwind: { path: '$loggedTime', preserveNullAndEmptyArrays: false } },
          { $match: { 'loggedTime.date': { $gte: filters.startDate, $lte: filters.endDate }, ...(selectedUserId ? { 'loggedTime.user': selectedUserId } : {}) } },
          { $group: { _id: '$loggedTime.user', loggedMinutes: { $sum: { $add: [{ $multiply: ['$loggedTime.hours', 60] }, '$loggedTime.minutes'] } } } },
        ],
        employeeEstimation: [
          { $unwind: { path: '$estimationTime', preserveNullAndEmptyArrays: false } },
          { $match: { 'estimationTime.date': { $gte: filters.startDate, $lte: filters.endDate }, ...(selectedUserId ? { 'estimationTime.user': selectedUserId } : {}) } },
          { $group: { _id: '$estimationTime.user', estimatedMinutes: { $sum: { $add: [{ $multiply: ['$estimationTime.hours', 60] }, '$estimationTime.minutes'] } } } },
        ],
        recentOverdue: [
          { $match: { $expr: isOverdue } },
          { $project: { _id: 1, title: 1, board: 1, dueDate: 1, priority: 1, status: 1, assignees: 1 } },
          { $sort: { dueDate: 1 } },
          { $limit: 8 },
        ],
      },
    },
  ];
};

const buildDailySeries = (filters, created = [], completed = [], time = []) => {
  const createdMap = new Map(created.map((item) => [item._id, item.created]));
  const completedMap = new Map(completed.map((item) => [item._id, item.completed]));
  const timeMap = new Map(time.map((item) => [item._id, item.minutes]));
  const days = [];
  const maxPoints = 62;
  const totalDays = Math.max(1, Math.ceil((filters.endDate - filters.startDate) / 86400000) + 1);
  const step = Math.max(1, Math.ceil(totalDays / maxPoints));
  for (let cursor = new Date(filters.startDate), index = 0; cursor <= filters.endDate; cursor.setDate(cursor.getDate() + 1), index += 1) {
    const key = cursor.toISOString().slice(0, 10);
    if (index % step !== 0 && cursor.getTime() + 86400000 <= filters.endDate.getTime()) continue;
    days.push({ date: key, created: createdMap.get(key) || 0, completed: completedMap.get(key) || 0, hours: round((timeMap.get(key) || 0) / HOURS, 1) });
  }
  return days;
};

const getFilterOptions = async (scope, boards) => {
  const departmentIds = [...new Set(boards.map((board) => id(board.department)))].map(oid);
  const boardIds = boards.map((board) => board._id);
  const [teams, users] = await Promise.all([
    Team.find({ department: { $in: departmentIds }, isActive: true }).select('_id name department owner').sort({ name: 1 }).lean(),
    scope.personalOnly
      ? User.find({ _id: scope.userId }).select('_id name avatar title department team role').lean()
      : User.find({ isActive: true, department: { $in: departmentIds } }).select('_id name avatar title department team role').sort({ name: 1 }).limit(1000).lean(),
  ]);
  return {
    departments: scope.departments.filter((department) => departmentIds.some((departmentId) => id(departmentId) === id(department._id))).map(({ _id, name }) => ({ id: _id, name })),
    managers: users.filter((user) => user.role === 'manager' || boards.some((board) => id(board.owner) === id(user._id))).map((user) => ({ id: user._id, name: user.name })),
    teams: teams.map((team) => ({ id: team._id, name: team.name, departmentId: team.department })),
    employees: users.map((user) => ({ id: user._id, name: user.name, avatar: user.avatar, title: user.title, teamId: user.team, departmentIds: user.department })),
    projects: boards.map((board) => ({ id: board._id, name: board.name, departmentId: board.department, teamId: board.team })),
    statuses: ['todo', 'pending', 'in-progress', 'review', 'blocked', 'done', 'cancelled'],
    priorities: ['low', 'medium', 'high', 'critical'],
    billingTypes: [...new Set(boards.map((board) => canonicalBillingType(board.billingCycle)).filter(Boolean))].map((billingType) => ({
      id: billingType,
      name: billingType === 'hr' ? 'Hourly' : billingType.charAt(0).toUpperCase() + billingType.slice(1),
    })),
    clients: [...new Set(boards.map((board) => board.clientDetails?.clientName).filter(Boolean))].sort(),
    boardIds,
  };
};

const getPreviousCreatedCount = async (boardIds, filters, scope) => {
  const duration = filters.endDate - filters.startDate + 1;
  const previousEnd = new Date(filters.startDate.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - duration + 1);
  return Card.countDocuments({
    board: { $in: boardIds }, isArchived: { $ne: true },
    createdAt: { $gte: previousStart, $lte: previousEnd },
    ...(scope.personalOnly ? { assignees: scope.userId } : {}),
    ...(filters.employeeId ? { assignees: oid(filters.employeeId) } : {}),
    ...(filters.status ? { status: new RegExp(`^${filters.status.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } : {}),
    ...(filters.priority ? { priority: filters.priority.toLowerCase() } : {}),
  });
};

export const getDashboardAnalytics = async (user, filters) => {
  const scope = await resolveAnalyticsScope(user);
  assertScopeFilter(scope, filters);
  if (scope.personalOnly && filters.employeeId && filters.employeeId !== id(scope.userId)) {
    throw new ErrorResponse('Employees can only view their own analytics', 403);
  }
  if (filters.employeeId && !scope.personalOnly) {
    const employeeInScope = await User.exists({ _id: oid(filters.employeeId), isActive: true, department: { $in: scope.departmentIds } });
    if (!employeeInScope) throw new ErrorResponse('You do not have access to the requested employee', 403);
  }

  const boards = filterScopedBoards(scope, filters);
  const boardIds = boards.map((board) => board._id);
  const filterOptionsPromise = getFilterOptions(scope, scope.boards);
  const analyticsPromise = boardIds.length ? Card.aggregate(buildCardPipeline(boardIds, filters, scope)).allowDiskUse(true) : Promise.resolve([emptyFacet()]);
  const previousPromise = boardIds.length ? getPreviousCreatedCount(boardIds, filters, scope) : Promise.resolve(0);
  const activityMatch = {
    board: { $in: boardIds }, createdAt: { $gte: filters.startDate, $lte: filters.endDate },
    ...(scope.personalOnly ? { user: scope.userId } : {}),
  };
  const activityPromise = boardIds.length
    ? Activity.find(activityMatch).select('type description user board card createdAt').sort({ createdAt: -1 }).limit(10)
      .populate('user', 'name avatar').populate('board', 'name').populate('card', 'title').lean()
    : Promise.resolve([]);

  const [rawResult, previousCreated, filterOptions, recentActivity] = await Promise.all([
    analyticsPromise, previousPromise, filterOptionsPromise, activityPromise,
  ]);
  const raw = rawResult[0] || emptyFacet();
  const totals = raw.totals?.[0] || {};
  const active = Math.max(0, (totals.total || 0) - (totals.completed || 0) - (totals.cancelled || 0));
  const pending = Math.max(0, active - (totals.inProgress || 0) - (totals.review || 0) - (totals.blocked || 0));
  const periodCreated = totals.currentCreated || 0;
  const taskGrowth = previousCreated > 0 ? percent(periodCreated - previousCreated, previousCreated) : (periodCreated > 0 ? 100 : 0);
  const estimatedHours = round((totals.estimatedMinutes || 0) / HOURS, 1);
  const loggedHours = round((totals.loggedMinutes || 0) / HOURS, 1);
  const billedHours = round((totals.billedMinutes || 0) / HOURS, 1);
  const rangeDays = analyticsRangeMeta(filters).days;
  const timeEfficiency = loggedHours > 0 ? percent(estimatedHours, loggedHours) : 0;

  const projectTaskMap = new Map(raw.projects.map((project) => [id(project._id), project]));
  const effectiveNow = filters.endDate < new Date() ? filters.endDate : new Date();
  const projectBoards = scopeBoardsToEmployeeProjects(boards, raw.projects, filters.employeeId);
  const projectRows = projectBoards.map((board) => {
    const task = projectTaskMap.get(id(board._id)) || {};
    const totalTasks = task.totalTasks || 0;
    const completedTasks = task.completedTasks || 0;
    const progress = percent(completedTasks, totalTasks);
    const delayed = board.dueDate && new Date(board.dueDate) < effectiveNow && board.status !== 'completed';
    return {
      id: board._id, name: board.name, departmentId: board.department, teamId: board.team,
      status: board.status || 'planning', priority: board.priority || 'medium', totalTasks, completedTasks,
      overdueTasks: task.overdueTasks || 0, progress, delayed: Boolean(delayed), dueDate: board.dueDate,
      estimatedHours: round((task.estimatedMinutes || 0) / HOURS, 1), loggedHours: round((task.loggedMinutes || 0) / HOURS, 1),
      client: board.clientDetails?.clientName || '', billingType: canonicalBillingType(board.billingCycle),
    };
  }).sort((a, b) => b.overdueTasks - a.overdueTasks || a.name.localeCompare(b.name));

  const employeeTaskMap = new Map(raw.employeeTasks.map((entry) => [id(entry._id), entry]));
  const employeeTimeMap = new Map(raw.employeeTime.map((entry) => [id(entry._id), entry.loggedMinutes || 0]));
  const employeeEstimationMap = new Map(raw.employeeEstimation.map((entry) => [id(entry._id), entry.estimatedMinutes || 0]));
  const visibleEmployeeIds = [...new Set([...employeeTaskMap.keys(), ...employeeTimeMap.keys(), ...employeeEstimationMap.keys(), ...(scope.personalOnly ? [id(scope.userId)] : [])])];
  const employees = visibleEmployeeIds.length
    ? await User.find({ _id: { $in: visibleEmployeeIds.map(oid) } }).select('_id name avatar title department team').lean()
    : [];
  const employeeRows = employees.map((employee) => {
    const task = employeeTaskMap.get(id(employee._id)) || {};
    const logged = round((employeeTimeMap.get(id(employee._id)) || 0) / HOURS, 1);
    const estimated = round((employeeEstimationMap.get(id(employee._id)) || 0) / HOURS, 1);
    const completionRate = percent(task.completedTasks || 0, task.totalTasks || 0);
    const workloadScore = Math.min(100, round(((task.pendingTasks || 0) / 10) * 100, 0));
    const productivityScore = round(Math.min(100, completionRate * 0.75 + Math.max(0, 100 - workloadScore) * 0.25), 1);
    const completionSamples = task.completionSamples || 0;
    const activeAgeSamples = task.activeAgeSamples || 0;
    return {
      id: employee._id, name: employee.name, avatar: employee.avatar, title: employee.title,
      departmentIds: employee.department, teamId: employee.team, assignedTasks: task.totalTasks || 0,
      completedTasks: task.completedTasks || 0, pendingTasks: task.pendingTasks || 0, overdueTasks: task.overdueTasks || 0,
      loggedHours: logged, estimatedHours: estimated, completionRate, productivityScore,
      timeEfficiency: logged > 0 ? percent(estimated, logged) : 0,
      capacityUtilization: round(Math.min(100, (logged / (rangeDays * 8)) * 100), 1),
      averageCompletionDays: completionSamples ? round(task.completionMs / completionSamples / 86400000, 1) : 0,
      completionSamples,
      averageTaskAgeDays: activeAgeSamples ? round(task.activeAgeMs / activeAgeSamples / 86400000, 1) : 0,
      activeAgeSamples,
      taskVelocity: round(((task.completedTasks || 0) / rangeDays) * 7, 1),
    };
  }).sort((a, b) => b.productivityScore - a.productivityScore || a.name.localeCompare(b.name));

  const departmentRows = scope.departments.map((department) => {
    const departmentProjects = projectRows.filter((project) => id(project.departmentId) === id(department._id));
    const totalTasks = departmentProjects.reduce((sum, project) => sum + project.totalTasks, 0);
    const completedTasks = departmentProjects.reduce((sum, project) => sum + project.completedTasks, 0);
    const logged = departmentProjects.reduce((sum, project) => sum + project.loggedHours, 0);
    return { id: department._id, name: department.name, projects: departmentProjects.length, totalTasks, completedTasks, completionRate: percent(completedTasks, totalTasks), loggedHours: round(logged, 1), overdueTasks: departmentProjects.reduce((sum, project) => sum + project.overdueTasks, 0) };
  }).filter((department) => !filters.departmentId || id(department.id) === filters.departmentId);

  const statusCounts = Object.fromEntries(raw.status.map((entry) => [entry._id, entry.value]));
  const projectStatus = projectRows.reduce((acc, project) => ({ ...acc, [project.status]: (acc[project.status] || 0) + 1 }), {});
  const completedProjects = projectStatus.completed || 0;
  const delayedProjects = projectRows.filter((project) => project.delayed).length;
  const averageProgress = projectRows.length ? round(projectRows.reduce((sum, project) => sum + project.progress, 0) / projectRows.length, 1) : 0;
  const projectHealth = projectRows.length ? percent(projectRows.filter((project) => !project.delayed && project.overdueTasks === 0).length, projectRows.length) : 0;

  return {
    meta: {
      generatedAt: new Date().toISOString(), role: scope.role, personalOnly: scope.personalOnly,
      range: analyticsRangeMeta(filters), appliedFilters: Object.fromEntries(Object.entries(filters).filter(([, value]) => typeof value === 'string')),
      metricDefinitions: {
        completionRate: 'Completed tasks divided by all active-scope tasks.',
        timeVariance: 'Estimated hours minus logged hours; a negative value is over estimate.',
        timeEfficiency: 'Estimated hours divided by logged hours.',
        averageCompletionTime: 'Average days from task startDate to its latest completion-state update.',
        projectHealth: 'Projects without overdue tasks or a passed due date divided by projects in scope.',
        productivityScore: '75% task completion rate plus 25% sustainable-workload score.',
      },
    },
    filters: { ...filterOptions, boardIds: undefined },
    kpis: {
      tasks: {
        total: totals.total || 0, active, completed: totals.completed || 0, pending,
        inProgress: totals.inProgress || 0, review: totals.review || 0, blocked: totals.blocked || 0,
        overdue: totals.overdue || 0, cancelled: totals.cancelled || 0,
        completionRate: percent(totals.completed || 0, totals.total || 0), growth: taskGrowth,
        averageCompletionDays: totals.completionSamples ? round(totals.completionMs / totals.completionSamples / 86400000, 1) : 0,
        averageTaskAgeDays: totals.activeAgeSamples ? round(totals.activeAgeMs / totals.activeAgeSamples / 86400000, 1) : 0,
        velocityPerWeek: round(((totals.completed || 0) / rangeDays) * 7, 1),
      },
      projects: {
        total: projectRows.length, active: projectStatus['in-progress'] || 0, completed: completedProjects,
        planning: projectStatus.planning || 0, onHold: projectStatus['on-hold'] || 0,
        delayed: delayedProjects, cancelled: projectStatus.cancelled || 0,
        averageProgress, health: projectHealth,
      },
      time: {
        estimatedHours, loggedHours, remainingHours: round(Math.max(0, estimatedHours - loggedHours), 1),
        varianceHours: round(estimatedHours - loggedHours, 1), efficiency: timeEfficiency,
        averageDailyHours: round(loggedHours / rangeDays, 1), weeklyHours: round((loggedHours / rangeDays) * 7, 1),
        monthlyHours: round((loggedHours / rangeDays) * 30, 1), billableHours: billedHours,
        nonBillableHours: round(Math.max(0, loggedHours - billedHours), 1),
      },
      team: {
        members: employeeRows.length,
        productivity: employeeRows.length ? round(employeeRows.reduce((sum, employee) => sum + employee.productivityScore, 0) / employeeRows.length, 1) : 0,
        efficiency: timeEfficiency, capacityUtilization: employeeRows.length ? round(Math.min(100, (loggedHours / (employeeRows.length * rangeDays * 8)) * 100), 1) : 0,
        workload: pending, averageCompletionDays: totals.completionSamples ? round(totals.completionMs / totals.completionSamples / 86400000, 1) : 0,
        averageTaskAgeDays: totals.activeAgeSamples ? round(totals.activeAgeMs / totals.activeAgeSamples / 86400000, 1) : 0,
        velocityPerWeek: round(((totals.completed || 0) / rangeDays) * 7, 1),
      },
    },
    charts: {
      status: raw.status.map((entry) => ({ name: entry._id, value: entry.value })),
      priority: raw.priority.map((entry) => ({ name: entry._id, value: entry.value })),
      dailyTrend: buildDailySeries(filters, raw.createdTrend, raw.completedTrend, raw.timeTrend),
      projectStatus: Object.entries(projectStatus).map(([name, value]) => ({ name, value })),
      departments: departmentRows,
      workload: employeeRows.slice(0, 12).map((employee) => ({ name: employee.name, assigned: employee.assignedTasks, completed: employee.completedTasks, overdue: employee.overdueTasks })),
    },
    projects: projectRows.slice(0, 100),
    employees: employeeRows.slice(0, 100),
    departments: departmentRows,
    recentActivity,
    attention: raw.recentOverdue.map((task) => {
      const project = projectRows.find((projectRow) => id(projectRow.id) === id(task.board));
      return {
        ...task,
        id: task._id,
        projectId: task.board,
        projectName: project?.name || 'Project',
        departmentId: project?.departmentId,
      };
    }),
  };
};

export const getAnalyticsTaskList = async (user, filters, pagination = {}) => {
  const scope = await resolveAnalyticsScope(user);
  assertScopeFilter(scope, filters);
  if (scope.personalOnly && filters.employeeId && filters.employeeId !== id(scope.userId)) {
    throw new ErrorResponse('Employees can only view their own analytics tasks', 403);
  }
  if (filters.employeeId && !scope.personalOnly) {
    const employeeInScope = await User.exists({
      _id: oid(filters.employeeId),
      isActive: true,
      department: { $in: scope.departmentIds },
    });
    if (!employeeInScope) throw new ErrorResponse('You do not have access to the requested employee', 403);
  }

  const boards = filterScopedBoards(scope, filters);
  const boardIds = boards.map((board) => board._id);
  const { limit, offset } = analyticsListWindow(pagination);
  const match = {
    board: { $in: boardIds },
    isArchived: { $ne: true },
    createdAt: { $lte: filters.endDate },
    ...(scope.personalOnly ? { assignees: scope.userId } : {}),
    ...(filters.employeeId ? { assignees: oid(filters.employeeId) } : {}),
    ...(filters.status ? { status: new RegExp(`^${filters.status.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } : {}),
    ...(filters.priority ? { priority: filters.priority.toLowerCase() } : {}),
  };
  applyTaskViewMatch(match, filters);

  const [taskDocuments, total] = await Promise.all([
    Card.find(match)
      .select('_id title board status priority dueDate updatedAt')
      .sort({ updatedAt: -1, _id: 1 })
      .skip(offset)
      .limit(limit)
      .lean(),
    Card.countDocuments(match),
  ]);
  const boardMap = new Map(boards.map((board) => [id(board._id), board]));
  const tasks = taskDocuments.map((task) => {
    const board = boardMap.get(id(task.board));
    return {
      id: task._id,
      title: task.title,
      status: task.status || 'pending',
      priority: task.priority || 'unassigned',
      dueDate: task.dueDate,
      updatedAt: task.updatedAt,
      projectId: task.board,
      projectName: board?.name || 'Project',
      departmentId: board?.department,
    };
  });

  return {
    tasks,
    pagination: {
      offset,
      limit,
      total,
      nextOffset: offset + tasks.length,
      hasMore: offset + tasks.length < total,
    },
  };
};

export const getEmployeeAssignedTasks = async (user, employeeId, filters, pagination = {}) => {
  const scope = await resolveAnalyticsScope(user);
  assertScopeFilter(scope, filters);
  const targetEmployeeId = oid(employeeId);

  if (scope.personalOnly && id(scope.userId) !== employeeId) {
    throw new ErrorResponse('Employees can only view their own assigned tasks', 403);
  }
  if (!scope.personalOnly) {
    const employeeInScope = await User.findOne({
      _id: targetEmployeeId,
      isActive: true,
      department: { $in: scope.departmentIds },
    }).select('_id name avatar title').lean();
    if (!employeeInScope) throw new ErrorResponse('You do not have access to the requested employee', 403);
  }

  const boards = filterScopedBoards(scope, filters);
  const boardIds = boards.map((board) => board._id);
  const { limit, offset } = analyticsListWindow(pagination);
  const match = {
    board: { $in: boardIds },
    assignees: targetEmployeeId,
    isArchived: { $ne: true },
    createdAt: { $lte: filters.endDate },
    ...(filters.status ? { status: new RegExp(`^${filters.status.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } : {}),
    ...(filters.priority ? { priority: filters.priority.toLowerCase() } : {}),
  };
  applyTaskViewMatch(match, filters);

  const [taskDocuments, total, employee] = await Promise.all([
    Card.find(match)
      .select('_id title board status priority startDate dueDate updatedAt subtaskStats estimationTime loggedTime')
      .sort({ dueDate: 1, updatedAt: -1, _id: 1 })
      .skip(offset)
      .limit(limit)
      .lean(),
    Card.countDocuments(match),
    User.findById(targetEmployeeId).select('_id name avatar title').lean(),
  ]);

  const boardMap = new Map(boards.map((board) => [id(board._id), board]));
  const effectiveNow = filters.endDate < new Date() ? filters.endDate : new Date();
  const entryMinutes = (entries = [], userId = null) => entries.reduce((sum, entry) => {
    const entryDate = new Date(entry.date || filters.startDate);
    if (entryDate < filters.startDate || entryDate > filters.endDate) return sum;
    if (userId && id(entry.user) !== id(userId)) return sum;
    return sum + (Number(entry.hours) || 0) * 60 + (Number(entry.minutes) || 0);
  }, 0);

  const tasks = taskDocuments.map((task) => {
    const normalizedStatusValue = String(task.status || 'pending').trim().toLowerCase();
    const completed = DONE_STATUSES.includes(normalizedStatusValue);
    const cancelled = CANCELLED_STATUSES.includes(normalizedStatusValue);
    const subtaskTotal = Number(task.subtaskStats?.total) || 0;
    const subtaskCompleted = Number(task.subtaskStats?.completed) || 0;
    const progress = completed ? 100 : subtaskTotal > 0 ? percent(subtaskCompleted, subtaskTotal) : 0;
    const estimatedMinutes = entryMinutes(task.estimationTime);
    const loggedMinutes = entryMinutes(task.loggedTime, targetEmployeeId);
    return {
      id: task._id,
      title: task.title,
      projectId: task.board,
      projectName: boardMap.get(id(task.board))?.name || 'Project',
      departmentId: boardMap.get(id(task.board))?.department,
      status: task.status || 'pending',
      priority: task.priority || 'unassigned',
      startDate: task.startDate,
      dueDate: task.dueDate,
      updatedAt: task.updatedAt,
      progress,
      completed,
      overdue: Boolean(task.dueDate && new Date(task.dueDate) < effectiveNow && !completed && !cancelled),
      estimatedHours: round(estimatedMinutes / HOURS, 1),
      loggedHours: round(loggedMinutes / HOURS, 1),
      remainingHours: round(Math.max(0, estimatedMinutes - loggedMinutes) / HOURS, 1),
    };
  });

  return {
    employee,
    tasks,
    pagination: {
      offset,
      limit,
      total,
      nextOffset: offset + tasks.length,
      hasMore: offset + tasks.length < total,
    },
  };
};
