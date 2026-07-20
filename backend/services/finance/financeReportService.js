import Board from '../../models/Board.js';
import Card from '../../models/Card.js';
import Subtask from '../../models/Subtask.js';
import SubtaskNano from '../../models/SubtaskNano.js';
import User from '../../models/User.js';
import UserPermission, { FINANCE_PAGE_KEY } from '../../models/UserPermission.js';
import Milestone from '../../models/Milestone.js';
import MilestoneApproval from '../../models/MilestoneApproval.js';
import logger from '../../utils/logger.js';
import { fromCents } from '../../utils/money.js';

export const BILLING_TYPES = Object.freeze({
  ALL: 'ALL',
  FIXED: 'FIXED',
  HOURLY: 'HOURLY',
  MILESTONE: 'MILESTONE'
});

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const normalizeBillingType = (value) => {
  const normalized = String(value || 'all').trim().toLowerCase();
  if (normalized === 'fixed') return BILLING_TYPES.FIXED;
  if (normalized === 'hourly' || normalized === 'hr') return BILLING_TYPES.HOURLY;
  if (normalized === 'milestone') return BILLING_TYPES.MILESTONE;
  return BILLING_TYPES.ALL;
};

export const normalizeFinanceFilters = (input = {}) => ({
  startDate: input.startDate || null,
  endDate: input.endDate || null,
  departmentId: input.departmentId || null,
  projectId: input.projectId || null,
  userId: input.userId || null,
  projectStatus: input.projectStatus || input.status || null,
  hiredClientOnly: input.hiredClientOnly !== false && input.hiredClientOnly !== 'false',
  billingType: normalizeBillingType(input.billingType),
  fixedRevenueMode: input.fixedRevenueMode === 'asOfEndDate' ? 'asOfEndDate' : 'inRange',
  viewType: input.viewType || 'users',
  year: input.year !== undefined && input.year !== null && input.year !== ''
    ? parseInt(input.year, 10)
    : new Date().getFullYear(),
  month: input.month !== undefined && input.month !== null && input.month !== ''
    ? parseInt(input.month, 10)
    : null
});

export const toDateString = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const applyFinanceDateRange = (date, filters = {}) => {
  const dateStr = toDateString(date);
  if (!dateStr) return false;
  if (filters.startDate && dateStr < filters.startDate) return false;
  if (filters.endDate && dateStr > filters.endDate) return false;
  return true;
};

const dateRangeIsActive = (filters = {}) => Boolean(filters.startDate || filters.endDate);

const getBillingTypeForProject = (project) => {
  const billingCycle = String(project?.billingCycle || '').trim().toLowerCase();
  if (billingCycle === 'fixed') return BILLING_TYPES.FIXED;
  if (billingCycle === 'hr' || billingCycle === 'hourly') return BILLING_TYPES.HOURLY;
  if (billingCycle === 'milestone') return BILLING_TYPES.MILESTONE;
  return null;
};

export const applyBillingTypeFilter = (projects = [], billingType = BILLING_TYPES.ALL) => {
  const normalized = normalizeBillingType(billingType);
  if (normalized === BILLING_TYPES.ALL) return projects;
  return projects.filter((project) => getBillingTypeForProject(project) === normalized);
};

export const calculateHourlyRevenue = (billedMinutes = 0, hourlyRate = 0) => (
  (Number(billedMinutes || 0) / 60) * Number(hourlyRate || 0)
);

export const getFixedRevenueDate = (project) => project?.startDate || project?.createdAt;

export const calculateFixedRevenue = (project, filters = {}) => {
  if (getBillingTypeForProject(project) !== BILLING_TYPES.FIXED) return 0;
  const fixedPrice = Number(project?.fixedPrice || 0);
  if (fixedPrice <= 0) return 0;
  if (filters.fixedRevenueMode === 'asOfEndDate') {
    const revenueDate = toDateString(getFixedRevenueDate(project));
    if (!revenueDate) return 0;
    if (filters.endDate && revenueDate > filters.endDate) return 0;
    return fixedPrice;
  }
  return applyFinanceDateRange(getFixedRevenueDate(project), filters) ? fixedPrice : 0;
};

export const calculateMilestoneRevenue = (approvals = [], filters = {}) => (
  fromCents((approvals || []).reduce((total, approval) => {
    if (!applyFinanceDateRange(approval.approvedAt || approval.recognizedAt, filters)) return total;
    return total + Number(approval.amountCents || 0);
  }, 0))
);

export const allocateMilestoneRevenueByApprover = (approvals = [], filters = {}) => {
  const allocatedCentsByUser = new Map();
  approvals.forEach((approval) => {
    if (!applyFinanceDateRange(approval?.approvedAt, filters)) return;
    const approverId = approval?.approvedBy?.toString();
    const amountCents = Number(approval?.amountCents || 0);
    if (!approverId || !Number.isSafeInteger(amountCents) || amountCents <= 0) return;
    allocatedCentsByUser.set(approverId, (allocatedCentsByUser.get(approverId) || 0) + amountCents);
  });
  return new Map([...allocatedCentsByUser].map(([userId, cents]) => [userId, fromCents(cents)]));
};

export const calculateTotalRevenue = ({
  fixedRevenue = 0,
  hourlyRevenue = 0,
  milestoneRevenue = 0
} = {}) => (
  Number(fixedRevenue || 0) + Number(hourlyRevenue || 0) + Number(milestoneRevenue || 0)
);

const buildDuration = (totalMinutes = 0) => {
  const safeMinutes = Math.max(0, Math.round(Number(totalMinutes || 0)));
  return {
    hours: Math.floor(safeMinutes / 60),
    minutes: safeMinutes % 60,
    totalMinutes: safeMinutes
  };
};

const minutesFromEntry = (entry) => ((Number(entry?.hours || 0) * 60) + Number(entry?.minutes || 0));

const resolveUserName = (entry, usersById) => {
  if (entry?.userName) return entry.userName;
  const userId = entry?.user?.toString();
  if (userId && usersById?.has(userId)) return usersById.get(userId);
  if (entry?.user?.name) return entry.user.name;
  return 'Unknown';
};

const addUserMinutes = (byUser, entry, minutes, usersById) => {
  const userId = entry?.user?.toString();
  if (!userId) return;
  if (!byUser[userId]) {
    byUser[userId] = {
      userId,
      userName: resolveUserName(entry, usersById),
      minutes: 0
    };
  }
  byUser[userId].minutes += minutes;
};

const aggregateEntries = (entries = [], filters, usersById, permittedUserIds, options = {}) => {
  const { requirePermittedUserForTotal = true } = options;
  const byUser = {};
  let totalMinutes = 0;

  for (const entry of entries || []) {
    const userId = entry?.user?.toString();
    const isPermittedUser = Boolean(userId && permittedUserIds.has(userId));
    if (requirePermittedUserForTotal && !isPermittedUser) continue;
    if (filters.userId && userId !== filters.userId) continue;
    if (!applyFinanceDateRange(entry.date, filters)) continue;

    const minutes = minutesFromEntry(entry);
    if (minutes <= 0) continue;
    totalMinutes += minutes;
    if (isPermittedUser) {
      addUserMinutes(byUser, entry, minutes, usersById);
    }
  }

  return { totalMinutes, byUser };
};

const mergeUserMinutes = (target, source, key) => {
  Object.values(source || {}).forEach((entry) => {
    if (!target[entry.userId]) {
      target[entry.userId] = {
        userId: entry.userId,
        userName: entry.userName,
        billedMinutes: 0,
        loggedMinutes: 0
      };
    }
    target[entry.userId][key] += entry.minutes;
  });
};

const collectUserIds = (entries = [], idSet) => {
  for (const entry of entries || []) {
    const userId = entry?.user?.toString();
    if (userId) idSet.add(userId);
  }
};

const buildUserNameMap = async (items = [], milestoneApprovals = []) => {
  const ids = new Set();
  items.forEach((item) => {
    collectUserIds(item.billedTime, ids);
    collectUserIds(item.loggedTime, ids);
  });
  milestoneApprovals.forEach((approval) => {
    const approverId = approval?.approvedBy?.toString();
    if (approverId) ids.add(approverId);
  });

  if (ids.size === 0) return new Map();

  const users = await User.find({ _id: { $in: Array.from(ids) } }).select('name').lean();
  return new Map(users.map((user) => [user._id.toString(), user.name]));
};

export const getFinancePermittedUserIds = async () => {
  const [permissions, admins] = await Promise.all([
    UserPermission.find({ pageKey: FINANCE_PAGE_KEY, hasAccess: true }).select('user').lean(),
    User.find({ role: /^admin$/i, isActive: { $ne: false } }).select('_id').lean()
  ]);

  return new Set([
    ...permissions.map((permission) => permission.user?.toString()).filter(Boolean),
    ...admins.map((admin) => admin._id?.toString()).filter(Boolean)
  ]);
};

const buildProjectMatch = (filters, includeBillingType = true) => {
  const match = {
    isArchived: false,
    isDeleted: { $ne: true }
  };

  if (filters.hiredClientOnly) match.projectType = 'Hired Client';
  if (filters.departmentId) match.department = filters.departmentId;
  if (filters.projectId) match._id = filters.projectId;
  if (filters.projectStatus) match.status = filters.projectStatus;

  if (includeBillingType) {
    if (filters.billingType === BILLING_TYPES.FIXED) match.billingCycle = 'fixed';
    if (filters.billingType === BILLING_TYPES.HOURLY) match.billingCycle = { $in: ['hr', 'hourly'] };
    if (filters.billingType === BILLING_TYPES.MILESTONE) match.billingCycle = 'milestone';
    if (filters.billingType === BILLING_TYPES.ALL) match.billingCycle = { $in: ['fixed', 'hr', 'hourly', 'milestone'] };
  }

  return match;
};

const groupByBoard = (items = []) => {
  const map = new Map();
  items.forEach((item) => {
    const boardId = item.board?.toString();
    if (!boardId) return;
    if (!map.has(boardId)) map.set(boardId, []);
    map.get(boardId).push(item);
  });
  return map;
};

const buildDataContext = async (rawFilters = {}) => {
  const filters = normalizeFinanceFilters(rawFilters);
  const permittedUserIds = await getFinancePermittedUserIds();
  const baseProjectMatch = buildProjectMatch(filters, false);
  const projectMatch = buildProjectMatch(filters, true);

  const [totalProjectsBeforeFiltering, projects] = await Promise.all([
    Board.countDocuments(baseProjectMatch),
    Board.find(projectMatch)
      .populate('department', 'name')
      .populate('members', 'name email avatar')
      .populate('owner', 'name email avatar')
      .sort({ createdAt: -1 })
      .lean()
  ]);

  const projectIds = projects.map((project) => project._id);
  const [cards, subtasks, nanos, milestones, milestoneApprovals] = projectIds.length > 0
    ? await Promise.all([
      Card.find({ board: { $in: projectIds }, isArchived: { $ne: true } })
        .select('board billedTime loggedTime title updatedAt')
        .lean(),
      Subtask.find({ board: { $in: projectIds } })
        .select('board task billedTime loggedTime title updatedAt')
        .lean(),
      SubtaskNano.find({ board: { $in: projectIds } })
        .select('board subtask billedTime loggedTime title updatedAt')
        .lean(),
      Milestone.find({ board: { $in: projectIds } })
        .select('board title amountCents approvedAmountCents status paidAt revenueRecognizedAt order')
        .sort({ board: 1, order: 1 })
        .lean(),
      MilestoneApproval.find({ board: { $in: projectIds } })
        .select('board milestone amountCents approvedBy approvedAt')
        .lean()
    ])
    : [[], [], [], [], []];

  const usersById = await buildUserNameMap([...cards, ...subtasks, ...nanos], milestoneApprovals);

  return {
    filters,
    permittedUserIds,
    usersById,
    projects,
    cardsByBoard: groupByBoard(cards),
    subtasksByBoard: groupByBoard(subtasks),
    nanosByBoard: groupByBoard(nanos),
    milestonesByBoard: groupByBoard(milestones),
    milestoneApprovalsByBoard: groupByBoard(milestoneApprovals),
    diagnostics: {
      totalProjectsBeforeFiltering,
      projectsAfterBillingTypeFiltering: projects.length
    }
  };
};

const getProjectEntities = (context, projectId) => [
  ...(context.cardsByBoard.get(projectId) || []),
  ...(context.subtasksByBoard.get(projectId) || []),
  ...(context.nanosByBoard.get(projectId) || [])
];

const getLastActivity = (entities = []) => {
  let lastActivity = null;
  entities.forEach((entity) => {
    if (!entity.updatedAt) return;
    if (!lastActivity || new Date(entity.updatedAt) > new Date(lastActivity.date)) {
      lastActivity = {
        type: entity.task ? 'subtask' : entity.subtask ? 'nano-subtask' : 'task',
        title: entity.title,
        date: entity.updatedAt
      };
    }
  });
  return lastActivity;
};

export const buildProjectMetric = (project, context, rangeFilters = context.filters) => {
  const projectId = project._id.toString();
  const entities = getProjectEntities(context, projectId);
  const milestones = context.milestonesByBoard.get(projectId) || [];
  const milestoneApprovals = context.milestoneApprovalsByBoard?.get(projectId) || [];
  const users = {};
  let billedMinutes = 0;
  let loggedMinutes = 0;

  for (const entity of entities) {
    const billed = aggregateEntries(entity.billedTime, rangeFilters, context.usersById, context.permittedUserIds);
    const logged = aggregateEntries(entity.loggedTime, rangeFilters, context.usersById, context.permittedUserIds, {
      requirePermittedUserForTotal: false
    });
    billedMinutes += billed.totalMinutes;
    loggedMinutes += logged.totalMinutes;
    mergeUserMinutes(users, billed.byUser, 'billedMinutes');
    mergeUserMinutes(users, logged.byUser, 'loggedMinutes');
  }

  const billingType = getBillingTypeForProject(project);
  const fixedRevenue = billingType === BILLING_TYPES.FIXED
    ? calculateFixedRevenue(project, rangeFilters)
    : 0;
  const hourlyRevenue = billingType === BILLING_TYPES.HOURLY
    ? calculateHourlyRevenue(billedMinutes, project.hourlyPrice)
    : 0;
  const milestoneRevenue = billingType === BILLING_TYPES.MILESTONE
    ? calculateMilestoneRevenue(milestoneApprovals, rangeFilters)
    : 0;
  const lifetimeMilestoneRevenue = billingType === BILLING_TYPES.MILESTONE
    ? calculateMilestoneRevenue(milestoneApprovals, {})
    : 0;
  const milestoneRevenueByApprover = billingType === BILLING_TYPES.MILESTONE
    ? allocateMilestoneRevenueByApprover(milestoneApprovals, rangeFilters)
    : new Map();
  milestoneRevenueByApprover.forEach((revenue, userId) => {
    if (rangeFilters.userId && userId !== rangeFilters.userId) return;
    if (!users[userId]) {
      users[userId] = {
        userId,
        userName: context.usersById.get(userId) || 'Unknown',
        billedMinutes: 0,
        loggedMinutes: 0
      };
    }
    users[userId].milestoneRevenue = Number(users[userId].milestoneRevenue || 0) + revenue;
  });
  const totalRevenue = calculateTotalRevenue({ fixedRevenue, hourlyRevenue, milestoneRevenue });
  const hasBillingData = billedMinutes > 0 || totalRevenue > 0;
  const hasActivityInRange = billedMinutes > 0 || loggedMinutes > 0 || totalRevenue > 0;

  return {
    project,
    projectId,
    billingType,
    billedMinutes,
    loggedMinutes,
    fixedRevenue,
    hourlyRevenue,
    milestoneRevenue,
    lifetimeMilestoneRevenue,
    totalRevenue,
    payment: totalRevenue,
    hasBillingData,
    hasActivityInRange,
    users,
    milestones,
    milestoneApprovals,
    lastActivity: getLastActivity(entities)
  };
};

const shouldIncludeProjectMetric = (metric, filters) => {
  if (!metric.billingType) return false;
  if (!dateRangeIsActive(filters)) return true;
  if (metric.billingType === BILLING_TYPES.MILESTONE) return true;
  return metric.hasActivityInRange;
};

const buildProjectMetrics = (context, rangeFilters = context.filters) => (
  context.projects
    .map((project) => buildProjectMetric(project, context, rangeFilters))
    .filter((metric) => shouldIncludeProjectMetric(metric, rangeFilters))
);

const metricRevenueAllocationCache = new WeakMap();

const getMetricProjectRevenueAllocations = (metric) => {
  const cached = metricRevenueAllocationCache.get(metric);
  if (cached) return cached;
  const result = new Map();
  const projectRevenue = metric.billingType === BILLING_TYPES.MILESTONE
    ? metric.milestoneRevenue
    : metric.fixedRevenue;
  const eligibleUsers = Object.values(metric.users || {}).filter((item) => item.billedMinutes > 0);
  const totalEligibleMinutes = eligibleUsers.reduce((sum, item) => sum + item.billedMinutes, 0);
  if (projectRevenue <= 0 || totalEligibleMinutes <= 0) {
    metricRevenueAllocationCache.set(metric, result);
    return result;
  }

  const revenueCents = Math.round(projectRevenue * 100);
  const allocations = eligibleUsers.map((item) => {
    const exactCents = (revenueCents * item.billedMinutes) / totalEligibleMinutes;
    return { userId: item.userId, cents: Math.floor(exactCents), remainder: exactCents - Math.floor(exactCents) };
  });
  let remainingCents = revenueCents - allocations.reduce((sum, allocation) => sum + allocation.cents, 0);
  allocations.sort((a, b) => b.remainder - a.remainder || String(a.userId).localeCompare(String(b.userId)));
  for (let index = 0; index < allocations.length && remainingCents > 0; index += 1, remainingCents -= 1) {
    allocations[index].cents += 1;
  }
  allocations.forEach((allocation) => result.set(allocation.userId, fromCents(allocation.cents)));
  metricRevenueAllocationCache.set(metric, result);
  return result;
};

export const calculateMetricUserRevenue = (metric, user) => {
  if (metric.billingType === BILLING_TYPES.HOURLY) {
    return calculateHourlyRevenue(user.billedMinutes, metric.project.hourlyPrice);
  }
  if (metric.billingType === BILLING_TYPES.MILESTONE) {
    return Number(user.milestoneRevenue || 0);
  }
  return getMetricProjectRevenueAllocations(metric).get(user.userId) || 0;
};

const buildSummaryFromMetrics = (metrics, context, filters = context.filters) => {
  let totalLoggedMinutes = 0;
  let totalBilledMinutes = 0;
  let fixedRevenue = 0;
  let hourlyRevenue = 0;
  let milestoneRevenue = 0;
  const userRevenue = {};
  const fixedProjectIds = new Set();
  const milestoneProjectIds = new Set();

  metrics.forEach((metric) => {
    totalLoggedMinutes += metric.loggedMinutes;
    totalBilledMinutes += metric.billedMinutes;
    fixedRevenue += metric.fixedRevenue;
    hourlyRevenue += metric.hourlyRevenue;
    milestoneRevenue += metric.milestoneRevenue;
    if (metric.billingType === BILLING_TYPES.FIXED && metric.fixedRevenue > 0) {
      fixedProjectIds.add(metric.projectId);
    }
    if (metric.billingType === BILLING_TYPES.MILESTONE) {
      milestoneProjectIds.add(metric.projectId);
    }

    Object.values(metric.users).forEach((user) => {
      if (!userRevenue[user.userId]) {
        userRevenue[user.userId] = {
          userId: user.userId,
          userName: user.userName,
          billedMinutes: 0,
          payment: 0
        };
      }

      userRevenue[user.userId].billedMinutes += user.billedMinutes;

      userRevenue[user.userId].payment += calculateMetricUserRevenue(metric, user);
    });
  });

  const totalRevenue = calculateTotalRevenue({ fixedRevenue, hourlyRevenue, milestoneRevenue });
  const topEarningUser = Object.values(userRevenue).sort((a, b) => b.payment - a.payment)[0] || null;
  const topMetric = [...metrics].sort((a, b) => b.totalRevenue - a.totalRevenue)[0] || null;
  const billableProjectCount = getBillableProjectCount(metrics);
  const fixedProjectCount = fixedProjectIds.size;
  const milestoneProjectCount = milestoneProjectIds.size;

  return {
    totalRevenue,
    fixedRevenue,
    hourlyRevenue,
    milestoneRevenue,
    totalLoggedTime: buildDuration(totalLoggedMinutes),
    totalBilledTime: buildDuration(totalBilledMinutes),
    unbilledTime: buildDuration(Math.max(0, totalLoggedMinutes - totalBilledMinutes)),
    topEarningUser: topEarningUser
      ? {
        userId: topEarningUser.userId,
        userName: topEarningUser.userName,
        billedMinutes: topEarningUser.billedMinutes,
        payment: topEarningUser.payment
      }
      : null,
    topRevenueProject: topMetric
      ? {
        projectId: topMetric.projectId,
        name: topMetric.project.name,
        department: topMetric.project.department?.name || 'Unassigned',
        departmentId: topMetric.project.department?._id?.toString() || null,
        payment: topMetric.totalRevenue,
        fixedRevenue: topMetric.fixedRevenue,
        hourlyRevenue: topMetric.hourlyRevenue,
        milestoneRevenue: topMetric.milestoneRevenue,
        billedMinutes: topMetric.billedMinutes,
        loggedMinutes: topMetric.loggedMinutes
      }
      : null,
    fixedProjectCount,
    milestoneProjectCount,
    totalFixedAmountProjects: {
      count: fixedProjectCount,
      amount: fixedRevenue
    },
    totalMilestoneProjects: {
      count: milestoneProjectCount,
      amount: milestoneRevenue
    },
    billableProjectCount,
    projectCount: billableProjectCount,
    filters: {
      startDate: filters.startDate,
      endDate: filters.endDate,
      departmentId: filters.departmentId,
      billingType: filters.billingType,
      fixedRevenueMode: filters.fixedRevenueMode
    }
  };
};

export const getBillableProjectCount = (metrics = []) => (
  metrics.filter((metric) => (
    metric.hasBillingData || metric.billingType === BILLING_TYPES.MILESTONE
  )).length
);

const logFinanceCalculation = (label, filters, context, metrics, summary, extra = {}) => {
  const fixedProjectCount = metrics.filter((metric) => metric.billingType === BILLING_TYPES.FIXED).length;
  const hourlyProjectCount = metrics.filter((metric) => metric.billingType === BILLING_TYPES.HOURLY).length;
  const milestoneProjectCount = metrics.filter((metric) => metric.billingType === BILLING_TYPES.MILESTONE).length;

  logger.info(`Finance ${label} calculated`, {
    filters: {
      startDate: filters.startDate,
      endDate: filters.endDate,
      departmentId: filters.departmentId,
      projectId: filters.projectId,
      userId: filters.userId,
      billingType: filters.billingType,
      fixedRevenueMode: filters.fixedRevenueMode
    },
    totalProjectsBeforeFiltering: context.diagnostics.totalProjectsBeforeFiltering,
    projectsAfterBillingTypeFiltering: context.diagnostics.projectsAfterBillingTypeFiltering,
    fixedProjectCount,
    hourlyProjectCount,
    milestoneProjectCount,
    billableProjectCount: summary.billableProjectCount,
    fixedRevenue: summary.fixedRevenue,
    hourlyRevenue: summary.hourlyRevenue,
    milestoneRevenue: summary.milestoneRevenue,
    totalRevenue: summary.totalRevenue,
    ...extra
  });
};

export const buildFinanceSummary = async (rawFilters = {}) => {
  const context = await buildDataContext(rawFilters);
  const metrics = buildProjectMetrics(context);
  const summary = buildSummaryFromMetrics(metrics, context);
  logFinanceCalculation('summary', context.filters, context, metrics, summary);
  return summary;
};

export const buildProjectFinanceReport = async (rawFilters = {}) => {
  const context = await buildDataContext(rawFilters);
  const metrics = buildProjectMetrics(context);
  const summary = buildSummaryFromMetrics(metrics, context);

  const data = metrics.map((metric) => ({
    projectId: metric.project._id,
    projectName: metric.project.name,
    department: metric.project.department?.name || 'Unassigned',
    departmentId: metric.project.department?._id,
    startDate: metric.project.startDate,
    endDate: metric.project.dueDate,
    estimatedTime: metric.project.estimatedTime,
    projectSource: metric.project.projectSource,
    upworkId: metric.project.upworkId,
    projectCategory: metric.project.projectCategory,
    billingCycle: metric.project.billingCycle,
    billingType: metric.project.billingCycle,
    hourlyPrice: metric.project.hourlyPrice,
    fixedPrice: metric.project.fixedPrice,
    totalProjectBudget: fromCents(metric.project.totalProjectBudgetCents),
    fixedRevenue: metric.fixedRevenue,
    hourlyRevenue: metric.hourlyRevenue,
    milestoneRevenue: metric.milestoneRevenue,
    recognizedMilestoneRevenue: metric.milestoneRevenue,
    lifetimeMilestoneRevenue: metric.lifetimeMilestoneRevenue,
    remainingProjectAmount: metric.billingType === BILLING_TYPES.MILESTONE
      ? Math.max(0, fromCents(metric.project.totalProjectBudgetCents) - metric.lifetimeMilestoneRevenue)
      : 0,
    milestoneCount: metric.milestones.length,
    paidMilestoneCount: metric.milestones.filter((milestone) => milestone.status === 'paid').length,
    totalRevenue: metric.totalRevenue,
    status: metric.project.status,
    clientInfo: metric.project.clientDetails,
    coordinators: (metric.project.members || []).slice(0, 5),
    coordinatorCount: metric.project.members?.length || 0,
    loggedTime: buildDuration(metric.loggedMinutes),
    billedTime: buildDuration(metric.billedMinutes),
    payment: metric.payment,
    hasBillingData: metric.hasBillingData,
    lastActivity: metric.lastActivity
  })).sort((a, b) => (b.payment || 0) - (a.payment || 0));

  const groupedByDepartment = {};
  data.forEach((project) => {
    const dept = project.department || 'Unassigned';
    if (!groupedByDepartment[dept]) groupedByDepartment[dept] = [];
    groupedByDepartment[dept].push(project);
  });

  logFinanceCalculation('projects', context.filters, context, metrics, summary);
  return { data, groupedByDepartment, summary };
};

export const buildUserFinanceReport = async (rawFilters = {}) => {
  const context = await buildDataContext(rawFilters);
  const metrics = buildProjectMetrics(context);
  const summary = buildSummaryFromMetrics(metrics, context);
  const userData = {};

  metrics.forEach((metric) => {
    Object.values(metric.users).forEach((user) => {
      const userPayment = calculateMetricUserRevenue(metric, user);

      if ((user.billedMinutes + user.loggedMinutes + userPayment) <= 0) return;

      if (!userData[user.userId]) {
        userData[user.userId] = {
          userId: user.userId,
          userName: user.userName,
          projects: {},
          totalBilledMinutes: 0,
          totalLoggedMinutes: 0
        };
      }

      userData[user.userId].totalBilledMinutes += user.billedMinutes;
      userData[user.userId].totalLoggedMinutes += user.loggedMinutes;
      userData[user.userId].projects[metric.projectId] = {
        projectId: metric.projectId,
        projectName: metric.project.name,
        department: metric.project.department?.name || 'Unassigned',
        departmentId: metric.project.department?._id?.toString() || null,
        billingCycle: metric.project.billingCycle,
        billingType: metric.project.billingCycle,
        hourlyPrice: metric.project.hourlyPrice,
        fixedPrice: metric.project.fixedPrice,
        totalProjectBudget: fromCents(metric.project.totalProjectBudgetCents),
        fixedRevenue: metric.fixedRevenue,
        hourlyRevenue: metric.hourlyRevenue,
        milestoneRevenue: metric.milestoneRevenue,
        billedMinutes: user.billedMinutes,
        loggedMinutes: user.loggedMinutes,
        payment: userPayment
      };
    });
  });

  const data = Object.values(userData).map((user) => {
    const projects = Object.values(user.projects);
    return {
      ...user,
      projects: projects.map((project) => ({
        ...project,
        billedTime: buildDuration(project.billedMinutes),
        loggedTime: buildDuration(project.loggedMinutes)
      })),
      totalBilledTime: buildDuration(user.totalBilledMinutes),
      totalLoggedTime: buildDuration(user.totalLoggedMinutes),
      totalPayment: projects.reduce((sum, project) => sum + (project.payment || 0), 0)
    };
  }).sort((a, b) => (b.totalPayment || 0) - (a.totalPayment || 0));

  const groupedByDepartment = {};
  data.forEach((user) => {
    user.projects.forEach((project) => {
      const dept = project.department || 'Unassigned';
      if (!groupedByDepartment[dept]) groupedByDepartment[dept] = [];
      groupedByDepartment[dept].push({ ...user, project });
    });
  });

  logFinanceCalculation('users', context.filters, context, metrics, summary);
  return { data, groupedByDepartment, summary };
};

export const getWeeksOfMonth = (year, month) => {
  const weeks = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let currentWeek = 1;
  let weekStart = new Date(firstDay);
  const dayOfWeek = weekStart.getDay();

  if (dayOfWeek !== 1) {
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    weekStart.setDate(weekStart.getDate() + diff);
  }

  while (weekStart <= lastDay && currentWeek <= 5) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const calcStart = weekStart < firstDay ? new Date(firstDay) : new Date(weekStart);
    const calcEnd = weekEnd > lastDay ? new Date(new Date(lastDay).setHours(23, 59, 59, 999)) : weekEnd;

    weeks.push({
      week: currentWeek,
      label: `Week ${currentWeek}`,
      start: calcStart,
      end: calcEnd
    });

    weekStart.setDate(weekStart.getDate() + 7);
    currentWeek += 1;
  }

  return weeks;
};

const rangeFromDates = (start, end, parentFilters) => ({
  ...parentFilters,
  startDate: toDateString(start),
  endDate: toDateString(end)
});

const buildWeeklyUsers = (metrics) => {
  const users = {};

  metrics.forEach((metric) => {
    Object.values(metric.users).forEach((user) => {
      const payment = calculateMetricUserRevenue(metric, user);

      if ((user.billedMinutes + user.loggedMinutes + payment) <= 0) return;

      if (!users[user.userId]) {
        users[user.userId] = {
          userId: user.userId,
          userName: user.userName,
          billedMinutes: 0,
          loggedMinutes: 0,
          projectIds: new Set(),
          payment: 0,
          projects: {}
        };
      }

      users[user.userId].billedMinutes += user.billedMinutes;
      users[user.userId].loggedMinutes += user.loggedMinutes;
      users[user.userId].payment += payment;
      users[user.userId].projectIds.add(metric.projectId);

      if (!users[user.userId].projects[metric.projectId]) {
        users[user.userId].projects[metric.projectId] = {
          projectId: metric.projectId,
          projectName: metric.project.name,
          departmentId: metric.project.department?._id?.toString() || null,
          billingCycle: metric.project.billingCycle,
          hourlyPrice: metric.project.hourlyPrice,
          billedMinutes: 0,
          payment: 0
        };
      }
      users[user.userId].projects[metric.projectId].billedMinutes += user.billedMinutes;
      users[user.userId].projects[metric.projectId].payment += payment;
    });
  });

  return Object.values(users).map((user) => ({
    userId: user.userId,
    userName: user.userName,
    billedMinutes: user.billedMinutes,
    loggedMinutes: user.loggedMinutes,
    projectCount: user.projectIds.size,
    payment: user.payment,
    projects: Object.values(user.projects)
  })).sort((a, b) => b.payment - a.payment);
};

const buildWeeklyProjects = (metrics) => (
  metrics
    .filter((metric) => metric.hasActivityInRange)
    .map((metric) => ({
      projectId: metric.project._id,
      projectName: metric.project.name,
      department: metric.project.department?.name || 'Unassigned',
      departmentId: metric.project.department?._id?.toString() || null,
      billingCycle: metric.project.billingCycle,
      billedMinutes: metric.billedMinutes,
      loggedMinutes: metric.loggedMinutes,
      payment: metric.totalRevenue,
      fixedRevenue: metric.fixedRevenue,
      hourlyRevenue: metric.hourlyRevenue,
      milestoneRevenue: metric.milestoneRevenue
    }))
    .sort((a, b) => b.payment - a.payment)
);

export const buildWeekWiseRevenue = (context, weeks, viewType = 'users') => (
  weeks.map((week) => {
    const weekFilters = rangeFromDates(week.start, week.end, context.filters);
    const metrics = buildProjectMetrics(context, weekFilters);
    const summary = buildSummaryFromMetrics(metrics, context, weekFilters);

    return {
      week: week.week,
      label: week.label,
      startDate: week.start,
      endDate: week.end,
      totalPayment: summary.totalRevenue,
      fixedRevenue: summary.fixedRevenue,
      hourlyRevenue: summary.hourlyRevenue,
      milestoneRevenue: summary.milestoneRevenue,
      totalBilledMinutes: summary.totalBilledTime.totalMinutes,
      totalLoggedMinutes: summary.totalLoggedTime.totalMinutes,
      items: viewType === 'projects' ? buildWeeklyProjects(metrics) : buildWeeklyUsers(metrics)
    };
  })
);

export const buildWeeklyFinanceReport = async (rawFilters = {}) => {
  const context = await buildDataContext(rawFilters);
  const targetYear = context.filters.year || new Date().getFullYear();
  const targetMonth = context.filters.month ?? new Date().getMonth();
  const weeks = getWeeksOfMonth(targetYear, targetMonth);
  const weeklyData = buildWeekWiseRevenue(context, weeks, context.filters.viewType);
  const monthlyTotals = {
    totalPayment: weeklyData.reduce((sum, week) => sum + week.totalPayment, 0),
    fixedRevenue: weeklyData.reduce((sum, week) => sum + week.fixedRevenue, 0),
    hourlyRevenue: weeklyData.reduce((sum, week) => sum + week.hourlyRevenue, 0),
    milestoneRevenue: weeklyData.reduce((sum, week) => sum + week.milestoneRevenue, 0),
    totalBilledMinutes: weeklyData.reduce((sum, week) => sum + week.totalBilledMinutes, 0),
    totalLoggedMinutes: weeklyData.reduce((sum, week) => sum + week.totalLoggedMinutes, 0)
  };

  logger.info('Finance weekly report calculated', {
    year: targetYear,
    month: targetMonth,
    viewType: context.filters.viewType,
    billingType: context.filters.billingType,
    weeklyReportCalculationRange: {
      startDate: toDateString(weeks[0]?.start),
      endDate: toDateString(weeks[weeks.length - 1]?.end)
    },
    totalRevenue: monthlyTotals.totalPayment
  });

  return {
    year: targetYear,
    month: targetMonth,
    weeks: weeklyData,
    monthlyTotals
  };
};

const buildMonthFromWeeklyData = (month, year, weeklyData) => {
  const monthResult = {
    month,
    monthName: MONTH_NAMES[month],
    hasData: false,
    weeks: [],
    totalPayment: 0,
    fixedRevenue: 0,
    hourlyRevenue: 0,
    milestoneRevenue: 0,
    items: []
  };

  for (let i = 0; i < 5; i += 1) {
    const week = weeklyData[i];
    monthResult.weeks.push({
      week: i + 1,
      payment: week ? week.totalPayment : null,
      billedMinutes: week ? week.totalBilledMinutes : null,
      hasData: Boolean(week && (week.totalPayment > 0 || week.totalBilledMinutes > 0))
    });

    if (week) {
      monthResult.totalPayment += week.totalPayment;
      monthResult.fixedRevenue += week.fixedRevenue;
      monthResult.hourlyRevenue += week.hourlyRevenue;
      monthResult.milestoneRevenue += week.milestoneRevenue;
    }
  }

  const itemMap = {};

  weeklyData.forEach((week, weekIndex) => {
    (week.items || []).forEach((item) => {
      const id = item.userId || item.projectId?.toString();
      if (!id) return;
      if (!itemMap[id]) {
        itemMap[id] = {
          ...item,
          weeks: [null, null, null, null, null],
          totalPayment: 0,
          projects: item.projects ? {} : undefined
        };
      }

      itemMap[id].weeks[weekIndex] = item.payment || 0;
      itemMap[id].totalPayment += item.payment || 0;

      if (item.projects && itemMap[id].projects) {
        item.projects.forEach((project) => {
          const projectId = project.projectId?.toString();
          if (!projectId) return;
          if (!itemMap[id].projects[projectId]) {
            itemMap[id].projects[projectId] = {
              ...project,
              weeks: [null, null, null, null, null],
              totalPayment: 0
            };
          }
          itemMap[id].projects[projectId].weeks[weekIndex] = project.payment || 0;
          itemMap[id].projects[projectId].totalPayment += project.payment || 0;
        });
      }
    });
  });

  monthResult.items = Object.values(itemMap)
    .filter((item) => item.totalPayment > 0)
    .map((item) => ({
      ...item,
      projects: item.projects ? Object.values(item.projects).filter((project) => project.totalPayment > 0) : undefined
    }))
    .sort((a, b) => b.totalPayment - a.totalPayment);

  monthResult.hasData = monthResult.totalPayment > 0 || monthResult.items.length > 0;
  return monthResult;
};

export const buildYearWideWeeklyReport = async (rawFilters = {}) => {
  const context = await buildDataContext(rawFilters);
  const targetYear = context.filters.year || new Date().getFullYear();
  const monthsToProcess = context.filters.month !== null
    ? [context.filters.month]
    : Array.from({ length: 12 }, (_, index) => index);
  const months = [];

  monthsToProcess.forEach((month) => {
    const weeks = getWeeksOfMonth(targetYear, month);
    const weeklyData = buildWeekWiseRevenue(context, weeks, context.filters.viewType);
    const monthResult = buildMonthFromWeeklyData(month, targetYear, weeklyData);
    if (monthResult.hasData || context.filters.month !== null) {
      months.push(monthResult);
    }
  });

  const yearTotal = months.reduce((sum, month) => sum + month.totalPayment, 0);

  logger.info('Finance year-wide weekly report calculated', {
    year: targetYear,
    month: context.filters.month,
    viewType: context.filters.viewType,
    billingType: context.filters.billingType,
    weeklyReportCalculationRange: {
      months: monthsToProcess
    },
    totalRevenue: yearTotal
  });

  return {
    year: targetYear,
    viewType: context.filters.viewType,
    months,
    yearTotal,
    selectedMonthTotal: context.filters.month !== null ? (months[0]?.totalPayment || 0) : null
  };
};

export const buildUserContributionsReport = async (projectId) => {
  const context = await buildDataContext({ projectId, billingType: 'all' });
  const metric = buildProjectMetrics(context)[0];

  if (!metric) return null;

  const contributions = Object.values(metric.users).map((user) => ({
    userId: user.userId,
    userName: user.userName,
    billedMinutes: user.billedMinutes,
    loggedMinutes: user.loggedMinutes,
    taskCount: user.billedMinutes > 0 ? 1 : 0,
    billedTime: buildDuration(user.billedMinutes),
    loggedTime: buildDuration(user.loggedMinutes),
    payment: calculateMetricUserRevenue(metric, user)
  })).sort((a, b) => b.billedMinutes - a.billedMinutes);

  return {
    project: {
      id: metric.project._id,
      name: metric.project.name,
      department: metric.project.department?.name,
      billingCycle: metric.project.billingCycle,
      hourlyPrice: metric.project.hourlyPrice,
      fixedPrice: metric.project.fixedPrice
      ,
      totalProjectBudget: fromCents(metric.project.totalProjectBudgetCents),
      milestoneRevenue: metric.milestoneRevenue
    },
    contributions,
    totalContributors: contributions.length
  };
};

