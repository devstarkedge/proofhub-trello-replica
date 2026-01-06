import mongoose from 'mongoose';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import User from '../models/User.js';
import Department from '../models/Department.js';
import Board from '../models/Board.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';

/**
 * @desc    Get team logged time analytics with role-based access
 * @route   GET /api/team-analytics/logged-time
 * @access  Private
 */
export const getTeamLoggedTime = asyncHandler(async (req, res, next) => {
  const { departmentId, startDate, endDate, userId } = req.query;
  const user = req.user;

  // Parse dates (default to last 7 days)
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  // Generate date range for the timeline
  const dateRange = [];
  const currentDate = new Date(start);
  while (currentDate <= end) {
    dateRange.push(new Date(currentDate).toISOString().split('T')[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Role-based access control
  let allowedUserIds = [];
  let departmentQuery = {};

  if (user.role === 'admin') {
    // Admin: Can see all users in all departments or specified department
    if (departmentId && departmentId !== 'all') {
      departmentQuery._id = new mongoose.Types.ObjectId(departmentId);
    }
  } else if (user.role === 'manager') {
    // Manager: Can only see users in their assigned departments
    const userDeptIds = Array.isArray(user.department) ? user.department : [user.department];
    if (departmentId && departmentId !== 'all') {
      // Verify manager has access to this department
      if (!userDeptIds.some(d => d.toString() === departmentId)) {
        return next(new ErrorResponse('Not authorized to access this department', 403));
      }
      departmentQuery._id = new mongoose.Types.ObjectId(departmentId);
    } else {
      departmentQuery._id = { $in: userDeptIds.map(d => new mongoose.Types.ObjectId(d)) };
    }
  } else {
    // Employee: Can only see their own data
    allowedUserIds = [user._id];
  }

  // Get users based on department access
  if (allowedUserIds.length === 0) {
    const departments = await Department.find(departmentQuery).select('members managers').lean();
    const allUserIds = new Set();
    departments.forEach(dept => {
      (dept.members || []).forEach(m => allUserIds.add(m.toString()));
      (dept.managers || []).forEach(m => allUserIds.add(m.toString()));
    });
    allowedUserIds = Array.from(allUserIds).map(id => new mongoose.Types.ObjectId(id));
  }

  // If specific user requested, verify access
  if (userId) {
    const targetUserId = new mongoose.Types.ObjectId(userId);
    if (user.role === 'employee' && user._id.toString() !== userId) {
      return next(new ErrorResponse('Not authorized to view other users data', 403));
    }
    if (!allowedUserIds.some(id => id.toString() === userId)) {
      return next(new ErrorResponse('Not authorized to view this user data', 403));
    }
    allowedUserIds = [targetUserId];
  }

  // Fetch user details
  const users = await User.find({ _id: { $in: allowedUserIds } })
    .select('name email avatar department role title')
    .populate('department', 'name')
    .lean();

  // Aggregation pipeline to get logged time from Cards, Subtasks, and SubtaskNanos
  const loggedTimeAggregation = [
    {
      $match: {
        'loggedTime.user': { $in: allowedUserIds },
        'loggedTime.date': { $gte: start, $lte: end }
      }
    },
    { $unwind: '$loggedTime' },
    {
      $match: {
        'loggedTime.user': { $in: allowedUserIds },
        'loggedTime.date': { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: {
          userId: '$loggedTime.user',
          date: { $dateToString: { format: '%Y-%m-%d', date: '$loggedTime.date' } }
        },
        totalMinutes: {
          $sum: { $add: [{ $multiply: ['$loggedTime.hours', 60] }, '$loggedTime.minutes'] }
        },
        entries: { $push: '$loggedTime' },
        taskCount: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.userId',
        dailyLogs: {
          $push: {
            date: '$_id.date',
            totalMinutes: '$totalMinutes',
            entries: '$entries',
            taskCount: '$taskCount'
          }
        },
        totalMinutes: { $sum: '$totalMinutes' }
      }
    }
  ];

  // Get logged time from all sources
  const [cardLogs, subtaskLogs, nanoLogs] = await Promise.all([
    Card.aggregate(loggedTimeAggregation),
    Subtask.aggregate(loggedTimeAggregation),
    SubtaskNano.aggregate(loggedTimeAggregation)
  ]);

  // Merge all logged time data
  const userLogMap = new Map();

  const mergeLogs = (logs) => {
    logs.forEach(log => {
      const existing = userLogMap.get(log._id.toString()) || {
        userId: log._id,
        dailyLogs: new Map(),
        totalMinutes: 0
      };

      log.dailyLogs.forEach(daily => {
        const existingDaily = existing.dailyLogs.get(daily.date) || {
          date: daily.date,
          totalMinutes: 0,
          taskCount: 0,
          entries: []
        };
        existingDaily.totalMinutes += daily.totalMinutes;
        existingDaily.taskCount += daily.taskCount;
        existingDaily.entries.push(...daily.entries);
        existing.dailyLogs.set(daily.date, existingDaily);
      });

      existing.totalMinutes += log.totalMinutes;
      userLogMap.set(log._id.toString(), existing);
    });
  };

  mergeLogs(cardLogs);
  mergeLogs(subtaskLogs);
  mergeLogs(nanoLogs);

  // Build response data
  const teamData = users.map(userInfo => {
    const logData = userLogMap.get(userInfo._id.toString()) || {
      dailyLogs: new Map(),
      totalMinutes: 0
    };

    const dailyTimeline = dateRange.map(date => {
      const dayLog = logData.dailyLogs.get(date);
      return {
        date,
        totalMinutes: dayLog?.totalMinutes || 0,
        hours: dayLog ? Math.floor(dayLog.totalMinutes / 60) : 0,
        minutes: dayLog ? dayLog.totalMinutes % 60 : 0,
        taskCount: dayLog?.taskCount || 0,
        hasData: !!dayLog
      };
    });

    const totalHours = Math.floor(logData.totalMinutes / 60);
    const totalMins = logData.totalMinutes % 60;
    const daysWithLogs = dailyTimeline.filter(d => d.hasData).length;
    const avgDailyMinutes = daysWithLogs > 0 ? Math.round(logData.totalMinutes / daysWithLogs) : 0;

    // Calculate productivity score (8 hours = 100%)
    const expectedDailyMinutes = 480; // 8 hours
    const expectedTotalMinutes = expectedDailyMinutes * dateRange.length;
    const productivityScore = expectedTotalMinutes > 0 
      ? Math.round((logData.totalMinutes / expectedTotalMinutes) * 100) 
      : 0;

    return {
      user: {
        _id: userInfo._id,
        name: userInfo.name,
        email: userInfo.email,
        avatar: userInfo.avatar,
        department: userInfo.department,
        role: userInfo.role,
        title: userInfo.title
      },
      dailyTimeline,
      summary: {
        totalMinutes: logData.totalMinutes,
        totalHours,
        totalMins,
        formattedTotal: `${totalHours}h ${totalMins}m`,
        daysWithLogs,
        totalDays: dateRange.length,
        avgDailyMinutes,
        avgDailyFormatted: `${Math.floor(avgDailyMinutes / 60)}h ${avgDailyMinutes % 60}m`,
        productivityScore,
        productivityStatus: getProductivityStatus(productivityScore)
      }
    };
  });

  // Calculate team-wide analytics
  const teamAnalytics = calculateTeamAnalytics(teamData, dateRange);

  res.status(200).json({
    success: true,
    data: {
      dateRange,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      teamData,
      analytics: teamAnalytics
    }
  });
});

/**
 * @desc    Get smart insights and AI analytics
 * @route   GET /api/team-analytics/insights
 * @access  Private (Admin/Manager)
 */
export const getSmartInsights = asyncHandler(async (req, res, next) => {
  const { departmentId, startDate, endDate } = req.query;
  const user = req.user;

  // Role check
  if (user.role === 'employee') {
    return next(new ErrorResponse('Only admin and managers can access team insights', 403));
  }

  // Parse dates
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  // Get department access
  let departmentQuery = {};
  if (user.role === 'manager') {
    const userDeptIds = Array.isArray(user.department) ? user.department : [user.department];
    if (departmentId && departmentId !== 'all') {
      if (!userDeptIds.some(d => d.toString() === departmentId)) {
        return next(new ErrorResponse('Not authorized to access this department', 403));
      }
      departmentQuery._id = new mongoose.Types.ObjectId(departmentId);
    } else {
      departmentQuery._id = { $in: userDeptIds.map(d => new mongoose.Types.ObjectId(d)) };
    }
  } else if (departmentId && departmentId !== 'all') {
    departmentQuery._id = new mongoose.Types.ObjectId(departmentId);
  }

  // Get all users in scope
  const departments = await Department.find(departmentQuery).select('members managers name').lean();
  const allUserIds = new Set();
  departments.forEach(dept => {
    (dept.members || []).forEach(m => allUserIds.add(m.toString()));
    (dept.managers || []).forEach(m => allUserIds.add(m.toString()));
  });
  const userIds = Array.from(allUserIds).map(id => new mongoose.Types.ObjectId(id));

  // Get users
  const users = await User.find({ _id: { $in: userIds } })
    .select('name email avatar')
    .lean();

  // Aggregation for insights
  const insightsAggregation = [
    {
      $match: {
        'loggedTime.user': { $in: userIds },
        'loggedTime.date': { $gte: start, $lte: end }
      }
    },
    { $unwind: '$loggedTime' },
    {
      $match: {
        'loggedTime.user': { $in: userIds },
        'loggedTime.date': { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: '$loggedTime.user',
        totalMinutes: {
          $sum: { $add: [{ $multiply: ['$loggedTime.hours', 60] }, '$loggedTime.minutes'] }
        },
        taskCount: { $sum: 1 },
        uniqueDays: { $addToSet: { $dateToString: { format: '%Y-%m-%d', date: '$loggedTime.date' } } }
      }
    },
    {
      $addFields: {
        daysLogged: { $size: '$uniqueDays' }
      }
    },
    { $sort: { totalMinutes: -1 } }
  ];

  const [cardInsights, subtaskInsights, nanoInsights] = await Promise.all([
    Card.aggregate(insightsAggregation),
    Subtask.aggregate(insightsAggregation),
    SubtaskNano.aggregate(insightsAggregation)
  ]);

  // Merge insights
  const userInsightMap = new Map();
  const mergeInsights = (insights) => {
    insights.forEach(insight => {
      const existing = userInsightMap.get(insight._id.toString()) || {
        userId: insight._id,
        totalMinutes: 0,
        taskCount: 0,
        daysLogged: new Set()
      };
      existing.totalMinutes += insight.totalMinutes;
      existing.taskCount += insight.taskCount;
      (insight.uniqueDays || []).forEach(d => existing.daysLogged.add(d));
      userInsightMap.set(insight._id.toString(), existing);
    });
  };

  mergeInsights(cardInsights);
  mergeInsights(subtaskInsights);
  mergeInsights(nanoInsights);

  // Calculate date range days
  const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  const expectedDailyMinutes = 480; // 8 hours
  const expectedTotalMinutes = expectedDailyMinutes * totalDays;

  // Build insights data
  const userInsights = users.map(u => {
    const insight = userInsightMap.get(u._id.toString()) || {
      totalMinutes: 0,
      taskCount: 0,
      daysLogged: new Set()
    };
    const daysLoggedCount = insight.daysLogged.size || 0;
    const productivityScore = expectedTotalMinutes > 0 
      ? Math.round((insight.totalMinutes / expectedTotalMinutes) * 100) 
      : 0;
    const avgDaily = daysLoggedCount > 0 ? Math.round(insight.totalMinutes / daysLoggedCount) : 0;

    return {
      user: u,
      totalMinutes: insight.totalMinutes,
      totalHours: Math.floor(insight.totalMinutes / 60),
      taskCount: insight.taskCount,
      daysLogged: daysLoggedCount,
      daysIdle: totalDays - daysLoggedCount,
      productivityScore,
      avgDailyMinutes: avgDaily,
      status: getProductivityStatus(productivityScore)
    };
  }).sort((a, b) => b.totalMinutes - a.totalMinutes);

  // Generate AI insights
  const topPerformers = userInsights.filter(u => u.productivityScore >= 80).slice(0, 5);
  const lowPerformers = userInsights.filter(u => u.productivityScore < 40 && u.productivityScore > 0);
  const idleUsers = userInsights.filter(u => u.daysIdle > totalDays * 0.5);
  const overworkedUsers = userInsights.filter(u => u.productivityScore > 120);
  const usersNeedingAttention = userInsights.filter(u => u.productivityScore >= 40 && u.productivityScore < 60);

  // Calculate trends
  const totalTeamMinutes = userInsights.reduce((sum, u) => sum + u.totalMinutes, 0);
  const avgTeamProductivity = userInsights.length > 0 
    ? Math.round(userInsights.reduce((sum, u) => sum + u.productivityScore, 0) / userInsights.length)
    : 0;

  // Smart predictions
  const predictions = generatePredictions(userInsights, totalDays);
  const alerts = generateAlerts(userInsights, topPerformers, lowPerformers, overworkedUsers);
  const suggestions = generateSuggestions(userInsights, avgTeamProductivity);

  res.status(200).json({
    success: true,
    data: {
      overview: {
        totalUsers: users.length,
        totalTeamMinutes,
        totalTeamHours: Math.floor(totalTeamMinutes / 60),
        avgTeamProductivity,
        activeDays: totalDays
      },
      insights: {
        topPerformers,
        lowPerformers,
        idleUsers,
        overworkedUsers,
        usersNeedingAttention
      },
      aiAnalysis: {
        predictions,
        alerts,
        suggestions,
        healthScore: calculateTeamHealthScore(userInsights)
      },
      userDetails: userInsights
    }
  });
});

/**
 * @desc    Get department-wise analytics
 * @route   GET /api/team-analytics/departments
 * @access  Private (Admin/Manager)
 */
export const getDepartmentAnalytics = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;
  const user = req.user;

  if (user.role === 'employee') {
    return next(new ErrorResponse('Only admin and managers can access department analytics', 403));
  }

  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  // Get departments based on role
  let departmentQuery = { isActive: true };
  if (user.role === 'manager') {
    const userDeptIds = Array.isArray(user.department) ? user.department : [user.department];
    departmentQuery._id = { $in: userDeptIds.map(d => new mongoose.Types.ObjectId(d)) };
  }

  const departments = await Department.find(departmentQuery)
    .select('name members managers')
    .lean();

  const departmentAnalytics = await Promise.all(departments.map(async (dept) => {
    const deptUserIds = [
      ...(dept.members || []).map(m => new mongoose.Types.ObjectId(m)),
      ...(dept.managers || []).map(m => new mongoose.Types.ObjectId(m))
    ];

    if (deptUserIds.length === 0) {
      return {
        department: dept,
        totalUsers: 0,
        totalMinutes: 0,
        avgProductivity: 0
      };
    }

    const aggregation = [
      {
        $match: {
          'loggedTime.user': { $in: deptUserIds },
          'loggedTime.date': { $gte: start, $lte: end }
        }
      },
      { $unwind: '$loggedTime' },
      {
        $match: {
          'loggedTime.user': { $in: deptUserIds },
          'loggedTime.date': { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: null,
          totalMinutes: {
            $sum: { $add: [{ $multiply: ['$loggedTime.hours', 60] }, '$loggedTime.minutes'] }
          },
          taskCount: { $sum: 1 }
        }
      }
    ];

    const [cardStats, subtaskStats, nanoStats] = await Promise.all([
      Card.aggregate(aggregation),
      Subtask.aggregate(aggregation),
      SubtaskNano.aggregate(aggregation)
    ]);

    const totalMinutes = (cardStats[0]?.totalMinutes || 0) + 
                        (subtaskStats[0]?.totalMinutes || 0) + 
                        (nanoStats[0]?.totalMinutes || 0);
    
    const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const expectedMinutes = deptUserIds.length * 480 * totalDays;
    const avgProductivity = expectedMinutes > 0 
      ? Math.round((totalMinutes / expectedMinutes) * 100)
      : 0;

    return {
      department: { _id: dept._id, name: dept.name },
      totalUsers: deptUserIds.length,
      totalMinutes,
      totalHours: Math.floor(totalMinutes / 60),
      avgProductivity,
      status: getProductivityStatus(avgProductivity)
    };
  }));

  res.status(200).json({
    success: true,
    data: departmentAnalytics.sort((a, b) => b.avgProductivity - a.avgProductivity)
  });
});

/**
 * @desc    Get daily trends for charts
 * @route   GET /api/team-analytics/trends
 * @access  Private
 */
export const getDailyTrends = asyncHandler(async (req, res, next) => {
  const { departmentId, startDate, endDate, granularity = 'daily' } = req.query;
  const user = req.user;

  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  // Get user scope based on role
  let userIds = [];
  if (user.role === 'employee') {
    userIds = [user._id];
  } else {
    let deptQuery = {};
    if (user.role === 'manager') {
      const userDeptIds = Array.isArray(user.department) ? user.department : [user.department];
      deptQuery._id = { $in: userDeptIds.map(d => new mongoose.Types.ObjectId(d)) };
    } else if (departmentId && departmentId !== 'all') {
      deptQuery._id = new mongoose.Types.ObjectId(departmentId);
    }
    
    const departments = await Department.find(deptQuery).select('members managers').lean();
    const allUserIds = new Set();
    departments.forEach(dept => {
      (dept.members || []).forEach(m => allUserIds.add(m.toString()));
      (dept.managers || []).forEach(m => allUserIds.add(m.toString()));
    });
    userIds = Array.from(allUserIds).map(id => new mongoose.Types.ObjectId(id));
  }

  const dateFormat = granularity === 'weekly' ? '%Y-W%V' : granularity === 'monthly' ? '%Y-%m' : '%Y-%m-%d';

  const trendAggregation = [
    {
      $match: {
        'loggedTime.user': { $in: userIds },
        'loggedTime.date': { $gte: start, $lte: end }
      }
    },
    { $unwind: '$loggedTime' },
    {
      $match: {
        'loggedTime.user': { $in: userIds },
        'loggedTime.date': { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: dateFormat, date: '$loggedTime.date' } },
        totalMinutes: {
          $sum: { $add: [{ $multiply: ['$loggedTime.hours', 60] }, '$loggedTime.minutes'] }
        },
        uniqueUsers: { $addToSet: '$loggedTime.user' },
        taskCount: { $sum: 1 }
      }
    },
    {
      $addFields: {
        activeUsers: { $size: '$uniqueUsers' }
      }
    },
    { $sort: { _id: 1 } }
  ];

  const [cardTrends, subtaskTrends, nanoTrends] = await Promise.all([
    Card.aggregate(trendAggregation),
    Subtask.aggregate(trendAggregation),
    SubtaskNano.aggregate(trendAggregation)
  ]);

  // Merge trends
  const trendMap = new Map();
  const mergeTrends = (trends) => {
    trends.forEach(t => {
      const existing = trendMap.get(t._id) || {
        date: t._id,
        totalMinutes: 0,
        activeUsers: new Set(),
        taskCount: 0
      };
      existing.totalMinutes += t.totalMinutes;
      (t.uniqueUsers || []).forEach(u => existing.activeUsers.add(u.toString()));
      existing.taskCount += t.taskCount;
      trendMap.set(t._id, existing);
    });
  };

  mergeTrends(cardTrends);
  mergeTrends(subtaskTrends);
  mergeTrends(nanoTrends);

  const trends = Array.from(trendMap.values()).map(t => ({
    date: t.date,
    totalMinutes: t.totalMinutes,
    totalHours: Math.floor(t.totalMinutes / 60),
    activeUsers: t.activeUsers.size,
    taskCount: t.taskCount
  })).sort((a, b) => a.date.localeCompare(b.date));

  res.status(200).json({
    success: true,
    data: {
      trends,
      summary: {
        totalMinutes: trends.reduce((sum, t) => sum + t.totalMinutes, 0),
        avgDailyMinutes: trends.length > 0 
          ? Math.round(trends.reduce((sum, t) => sum + t.totalMinutes, 0) / trends.length)
          : 0,
        peakDay: trends.length > 0 
          ? trends.reduce((max, t) => t.totalMinutes > max.totalMinutes ? t : max, trends[0])
          : null
      }
    }
  });
});

/**
 * @desc    Get user's personal logged time summary
 * @route   GET /api/team-analytics/my-summary
 * @access  Private
 */
export const getMyLoggedTimeSummary = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;
  const userId = req.user._id;

  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  const aggregation = [
    {
      $match: {
        'loggedTime.user': userId,
        'loggedTime.date': { $gte: start, $lte: end }
      }
    },
    { $unwind: '$loggedTime' },
    {
      $match: {
        'loggedTime.user': userId,
        'loggedTime.date': { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$loggedTime.date' } },
        totalMinutes: {
          $sum: { $add: [{ $multiply: ['$loggedTime.hours', 60] }, '$loggedTime.minutes'] }
        },
        entries: { $push: '$loggedTime' },
        taskCount: { $sum: 1 }
      }
    },
    { $sort: { _id: -1 } }
  ];

  const [cardLogs, subtaskLogs, nanoLogs] = await Promise.all([
    Card.aggregate(aggregation),
    Subtask.aggregate(aggregation),
    SubtaskNano.aggregate(aggregation)
  ]);

  // Merge daily logs
  const dailyMap = new Map();
  const mergeDailyLogs = (logs) => {
    logs.forEach(log => {
      const existing = dailyMap.get(log._id) || {
        date: log._id,
        totalMinutes: 0,
        taskCount: 0
      };
      existing.totalMinutes += log.totalMinutes;
      existing.taskCount += log.taskCount;
      dailyMap.set(log._id, existing);
    });
  };

  mergeDailyLogs(cardLogs);
  mergeDailyLogs(subtaskLogs);
  mergeDailyLogs(nanoLogs);

  const dailyLogs = Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date));
  const totalMinutes = dailyLogs.reduce((sum, d) => sum + d.totalMinutes, 0);
  const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  const daysWithLogs = dailyLogs.length;
  const expectedMinutes = totalDays * 480;
  const productivityScore = expectedMinutes > 0 ? Math.round((totalMinutes / expectedMinutes) * 100) : 0;

  res.status(200).json({
    success: true,
    data: {
      dailyLogs,
      summary: {
        totalMinutes,
        totalHours: Math.floor(totalMinutes / 60),
        totalMins: totalMinutes % 60,
        formattedTotal: `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`,
        daysWithLogs,
        totalDays,
        avgDailyMinutes: daysWithLogs > 0 ? Math.round(totalMinutes / daysWithLogs) : 0,
        productivityScore,
        status: getProductivityStatus(productivityScore)
      }
    }
  });
});

// Helper functions
function getProductivityStatus(score) {
  if (score >= 100) return { label: 'Excellent', color: 'green', emoji: '😎' };
  if (score >= 80) return { label: 'Good', color: 'emerald', emoji: '😊' };
  if (score >= 60) return { label: 'Normal', color: 'yellow', emoji: '😐' };
  if (score >= 40) return { label: 'Below Average', color: 'orange', emoji: '😕' };
  if (score > 0) return { label: 'Needs Attention', color: 'red', emoji: '😴' };
  return { label: 'No Activity', color: 'gray', emoji: '❌' };
}

function calculateTeamAnalytics(teamData, dateRange) {
  const totalMembers = teamData.length;
  const totalTeamMinutes = teamData.reduce((sum, m) => sum + m.summary.totalMinutes, 0);
  const avgProductivity = totalMembers > 0 
    ? Math.round(teamData.reduce((sum, m) => sum + m.summary.productivityScore, 0) / totalMembers)
    : 0;

  // Daily totals for charts
  const dailyTotals = dateRange.map(date => {
    const dayTotal = teamData.reduce((sum, member) => {
      const dayData = member.dailyTimeline.find(d => d.date === date);
      return sum + (dayData?.totalMinutes || 0);
    }, 0);
    const activeMembers = teamData.filter(member => {
      const dayData = member.dailyTimeline.find(d => d.date === date);
      return dayData?.hasData;
    }).length;

    return {
      date,
      totalMinutes: dayTotal,
      totalHours: Math.floor(dayTotal / 60),
      activeMembers
    };
  });

  // Top performers
  const topPerformers = [...teamData]
    .sort((a, b) => b.summary.productivityScore - a.summary.productivityScore)
    .slice(0, 5);

  // Members needing attention
  const needsAttention = teamData.filter(m => m.summary.productivityScore < 50);

  return {
    summary: {
      totalMembers,
      totalTeamMinutes,
      totalTeamHours: Math.floor(totalTeamMinutes / 60),
      avgProductivity,
      teamStatus: getProductivityStatus(avgProductivity)
    },
    dailyTotals,
    topPerformers,
    needsAttention
  };
}

function generatePredictions(userInsights, totalDays) {
  const avgProductivity = userInsights.length > 0
    ? userInsights.reduce((sum, u) => sum + u.productivityScore, 0) / userInsights.length
    : 0;

  const predictions = [];

  if (avgProductivity < 50) {
    predictions.push({
      type: 'warning',
      message: 'Team productivity is trending below target. Consider reviewing workload distribution.',
      confidence: 85
    });
  }

  const consistentPerformers = userInsights.filter(u => 
    u.daysLogged >= totalDays * 0.8 && u.productivityScore >= 70
  );
  if (consistentPerformers.length > 0) {
    predictions.push({
      type: 'positive',
      message: `${consistentPerformers.length} team member(s) showing consistent high performance.`,
      confidence: 90
    });
  }

  const improvingUsers = userInsights.filter(u => 
    u.productivityScore >= 60 && u.productivityScore < 80
  );
  if (improvingUsers.length > 0) {
    predictions.push({
      type: 'info',
      message: `${improvingUsers.length} team member(s) are close to high performance. Small improvements could push them to top performers.`,
      confidence: 75
    });
  }

  return predictions;
}

function generateAlerts(userInsights, topPerformers, lowPerformers, overworkedUsers) {
  const alerts = [];

  if (lowPerformers.length > userInsights.length * 0.3) {
    alerts.push({
      type: 'critical',
      title: 'High number of underperforming members',
      message: `${lowPerformers.length} team members are logging significantly less time than expected.`,
      action: 'Review individual performance and provide support'
    });
  }

  if (overworkedUsers.length > 0) {
    alerts.push({
      type: 'warning',
      title: 'Potential burnout risk',
      message: `${overworkedUsers.length} team member(s) are logging excessive hours which may lead to burnout.`,
      action: 'Consider redistributing workload'
    });
  }

  const idleUsers = userInsights.filter(u => u.daysLogged === 0);
  if (idleUsers.length > 0) {
    alerts.push({
      type: 'info',
      title: 'Members with no logged time',
      message: `${idleUsers.length} team member(s) have not logged any time in the selected period.`,
      action: 'Check if they are on leave or need assistance'
    });
  }

  return alerts;
}

function generateSuggestions(userInsights, avgProductivity) {
  const suggestions = [];

  if (avgProductivity < 60) {
    suggestions.push({
      icon: '📊',
      title: 'Improve time tracking habits',
      description: 'Encourage team members to log time consistently throughout the day'
    });
  }

  if (avgProductivity >= 80) {
    suggestions.push({
      icon: '🎉',
      title: 'Recognize top performers',
      description: 'Consider rewarding team members maintaining high productivity'
    });
  }

  const inconsistentLoggers = userInsights.filter(u => 
    u.daysLogged > 0 && u.daysLogged < u.totalDays * 0.5
  );
  if (inconsistentLoggers.length > 0) {
    suggestions.push({
      icon: '⏰',
      title: 'Address inconsistent logging',
      description: `${inconsistentLoggers.length} members log time sporadically. Set up daily reminders.`
    });
  }

  suggestions.push({
    icon: '📈',
    title: 'Set realistic targets',
    description: 'Ensure 8-hour daily targets align with actual work requirements'
  });

  return suggestions;
}

function calculateTeamHealthScore(userInsights) {
  if (userInsights.length === 0) return 0;

  const avgProductivity = userInsights.reduce((sum, u) => sum + u.productivityScore, 0) / userInsights.length;
  const consistencyScore = userInsights.filter(u => u.daysLogged > 0).length / userInsights.length * 100;
  const balanceScore = 100 - (userInsights.reduce((sum, u) => {
    return sum + Math.abs(u.productivityScore - avgProductivity);
  }, 0) / userInsights.length);

  return Math.round((avgProductivity * 0.4 + consistencyScore * 0.3 + balanceScore * 0.3));
}

export default {
  getTeamLoggedTime,
  getSmartInsights,
  getDepartmentAnalytics,
  getDailyTrends,
  getMyLoggedTimeSummary
};
