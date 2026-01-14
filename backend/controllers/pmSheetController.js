import mongoose from 'mongoose';
import Board from '../models/Board.js';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import Department from '../models/Department.js';
import User from '../models/User.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';

// Helper function to get week number in month
const getWeekOfMonth = (date) => {
  const d = new Date(date);
  const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
  const dayOfMonth = d.getDate();
  const firstDayOfWeek = firstDay.getDay();
  return Math.ceil((dayOfMonth + firstDayOfWeek) / 7);
};

// Helper function to get week range label
const getWeekLabel = (weekNum) => {
  const ordinals = ['1st', '2nd', '3rd', '4th', '5th'];
  return `${ordinals[weekNum - 1] || weekNum + 'th'} Week`;
};

// Helper function to calculate payment
const calculatePayment = (billedMinutes, billingType, hourlyRate, fixedPrice) => {
  if (billingType === 'fixed') {
    return fixedPrice || 0;
  }
  // Hourly billing
  const hours = billedMinutes / 60;
  return hours * (hourlyRate || 0);
};

// Helper function to aggregate time logs
const aggregateTimeLogs = (items, dateField = 'date') => {
  let totalLogged = 0;
  let totalBilled = 0;
  
  items.forEach(item => {
    if (item.loggedTime && Array.isArray(item.loggedTime)) {
      item.loggedTime.forEach(log => {
        totalLogged += (log.hours || 0) * 60 + (log.minutes || 0);
      });
    }
    if (item.billedTime && Array.isArray(item.billedTime)) {
      item.billedTime.forEach(log => {
        totalBilled += (log.hours || 0) * 60 + (log.minutes || 0);
      });
    }
  });
  
  return { totalLogged, totalBilled };
};

// Helper to format minutes to hours and minutes
const formatTime = (totalMinutes) => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return { hours, minutes, display: `${hours}h ${minutes}m`, totalMinutes };
};

// Helper to get departments based on user role
const getAccessibleDepartments = async (user) => {
  const userRole = user.role.toLowerCase();
  
  if (userRole === 'admin') {
    return Department.find({ isActive: true });
  } else if (userRole === 'manager') {
    return Department.find({ 
      _id: { $in: user.department },
      isActive: true 
    });
  }
  
  return [];
};

// @desc    Get PM Sheet Dashboard Data (Department -> Month -> Week -> User)
// @route   GET /api/pm-sheet/dashboard
// @access  Private (Admin, Manager)
export const getDashboardData = asyncHandler(async (req, res, next) => {
  const { 
    startDate, 
    endDate, 
    userId, 
    departmentId, 
    projectId,
    billingType,
    projectCategory,
    coordinatorId,
    status
  } = req.query;

  // Parse dates
  const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = endDate ? new Date(endDate) : new Date();
  end.setHours(23, 59, 59, 999);

  // Get accessible departments
  const accessibleDepts = await getAccessibleDepartments(req.user);
  const accessibleDeptIds = accessibleDepts.map(d => d._id);

  // Build department filter
  let deptFilter = { _id: { $in: accessibleDeptIds }, isActive: true };
  if (departmentId && departmentId !== 'all') {
    deptFilter._id = new mongoose.Types.ObjectId(departmentId);
  }

  const departments = await Department.find(deptFilter)
    .populate('managers', 'name email avatar')
    .lean();

  // Build board (project) match conditions
  const boardMatch = {
    department: { $in: departments.map(d => d._id) }
  };
  
  if (projectId) boardMatch._id = new mongoose.Types.ObjectId(projectId);
  if (billingType) boardMatch.billingCycle = billingType;
  if (projectCategory) boardMatch.projectCategory = projectCategory;
  if (status) boardMatch.status = status;
  if (coordinatorId) boardMatch.members = new mongoose.Types.ObjectId(coordinatorId);

  // Get all relevant boards
  const boards = await Board.find(boardMatch)
    .populate('members', 'name email avatar')
    .populate('owner', 'name email avatar')
    .lean();

  const boardIds = boards.map(b => b._id);

  // Build user filter for time logs
  let userMatch = {};
  if (userId && userId !== 'all') {
    userMatch['loggedTime.user'] = new mongoose.Types.ObjectId(userId);
  }

  // Aggregate card time data
  const cardTimeData = await Card.aggregate([
    {
      $match: {
        board: { $in: boardIds },
        ...userMatch
      }
    },
    { $unwind: { path: '$loggedTime', preserveNullAndEmptyArrays: true } },
    {
      $match: {
        $or: [
          { 'loggedTime.date': { $gte: start, $lte: end } },
          { loggedTime: { $exists: false } }
        ]
      }
    },
    {
      $group: {
        _id: {
          board: '$board',
          user: '$loggedTime.user',
          year: { $year: '$loggedTime.date' },
          month: { $month: '$loggedTime.date' },
          week: { $week: '$loggedTime.date' },
          day: { $dayOfMonth: '$loggedTime.date' }
        },
        loggedMinutes: { 
          $sum: { 
            $add: [
              { $multiply: [{ $ifNull: ['$loggedTime.hours', 0] }, 60] },
              { $ifNull: ['$loggedTime.minutes', 0] }
            ]
          }
        },
        cardIds: { $addToSet: '$_id' }
      }
    }
  ]);

  // Aggregate billed time data
  const billedTimeData = await Card.aggregate([
    {
      $match: {
        board: { $in: boardIds }
      }
    },
    { $unwind: { path: '$billedTime', preserveNullAndEmptyArrays: true } },
    {
      $match: {
        $or: [
          { 'billedTime.date': { $gte: start, $lte: end } },
          { billedTime: { $exists: false } }
        ],
        ...(userId && userId !== 'all' ? { 'billedTime.user': new mongoose.Types.ObjectId(userId) } : {})
      }
    },
    {
      $group: {
        _id: {
          board: '$board',
          user: '$billedTime.user',
          year: { $year: '$billedTime.date' },
          month: { $month: '$billedTime.date' },
          week: { $week: '$billedTime.date' }
        },
        billedMinutes: { 
          $sum: { 
            $add: [
              { $multiply: [{ $ifNull: ['$billedTime.hours', 0] }, 60] },
              { $ifNull: ['$billedTime.minutes', 0] }
            ]
          }
        }
      }
    }
  ]);

  // Aggregate subtask time data
  const subtaskTimeData = await Subtask.aggregate([
    {
      $match: {
        board: { $in: boardIds }
      }
    },
    { $unwind: { path: '$loggedTime', preserveNullAndEmptyArrays: true } },
    {
      $match: {
        $or: [
          { 'loggedTime.date': { $gte: start, $lte: end } },
          { loggedTime: { $exists: false } }
        ],
        ...(userId && userId !== 'all' ? { 'loggedTime.user': new mongoose.Types.ObjectId(userId) } : {})
      }
    },
    {
      $group: {
        _id: {
          board: '$board',
          user: '$loggedTime.user',
          year: { $year: '$loggedTime.date' },
          month: { $month: '$loggedTime.date' },
          week: { $week: '$loggedTime.date' }
        },
        loggedMinutes: { 
          $sum: { 
            $add: [
              { $multiply: [{ $ifNull: ['$loggedTime.hours', 0] }, 60] },
              { $ifNull: ['$loggedTime.minutes', 0] }
            ]
          }
        }
      }
    }
  ]);

  // Aggregate nano-subtask time data
  const nanoTimeData = await SubtaskNano.aggregate([
    {
      $match: {
        board: { $in: boardIds }
      }
    },
    { $unwind: { path: '$loggedTime', preserveNullAndEmptyArrays: true } },
    {
      $match: {
        $or: [
          { 'loggedTime.date': { $gte: start, $lte: end } },
          { loggedTime: { $exists: false } }
        ],
        ...(userId && userId !== 'all' ? { 'loggedTime.user': new mongoose.Types.ObjectId(userId) } : {})
      }
    },
    {
      $group: {
        _id: {
          board: '$board',
          user: '$loggedTime.user',
          year: { $year: '$loggedTime.date' },
          month: { $month: '$loggedTime.date' },
          week: { $week: '$loggedTime.date' }
        },
        loggedMinutes: { 
          $sum: { 
            $add: [
              { $multiply: [{ $ifNull: ['$loggedTime.hours', 0] }, 60] },
              { $ifNull: ['$loggedTime.minutes', 0] }
            ]
          }
        }
      }
    }
  ]);

  // Get unique user IDs for lookup
  const userIds = new Set();
  [...cardTimeData, ...billedTimeData, ...subtaskTimeData, ...nanoTimeData].forEach(item => {
    if (item._id.user) userIds.add(item._id.user.toString());
  });

  const users = await User.find({ _id: { $in: Array.from(userIds) } })
    .select('name email avatar department')
    .lean();

  const userMap = {};
  users.forEach(u => { userMap[u._id.toString()] = u; });

  // Create board map with billing info
  const boardMap = {};
  boards.forEach(b => {
    boardMap[b._id.toString()] = {
      ...b,
      billingType: b.billingCycle,
      hourlyRate: b.hourlyPrice || 0,
      fixedPrice: b.fixedPrice || 0
    };
  });

  // Build hierarchical data: Department -> Month -> Week -> User
  const result = [];

  for (const dept of departments) {
    const deptBoards = boards.filter(b => b.department.toString() === dept._id.toString());
    const deptBoardIds = deptBoards.map(b => b._id.toString());

    // Group time data by month -> week -> user
    const monthlyData = {};

    // Process card logged time
    cardTimeData.forEach(item => {
      if (!deptBoardIds.includes(item._id.board?.toString())) return;
      if (!item._id.user || !item._id.month) return;

      const monthKey = `${item._id.year}-${String(item._id.month).padStart(2, '0')}`;
      const weekKey = getWeekLabel(getWeekOfMonth(new Date(item._id.year, item._id.month - 1, item._id.day || 1)));
      const userKey = item._id.user.toString();

      if (!monthlyData[monthKey]) monthlyData[monthKey] = {};
      if (!monthlyData[monthKey][weekKey]) monthlyData[monthKey][weekKey] = {};
      if (!monthlyData[monthKey][weekKey][userKey]) {
        monthlyData[monthKey][weekKey][userKey] = {
          loggedMinutes: 0,
          billedMinutes: 0,
          projects: new Set()
        };
      }

      monthlyData[monthKey][weekKey][userKey].loggedMinutes += item.loggedMinutes || 0;
      monthlyData[monthKey][weekKey][userKey].projects.add(item._id.board.toString());
    });

    // Process billed time
    billedTimeData.forEach(item => {
      if (!deptBoardIds.includes(item._id.board?.toString())) return;
      if (!item._id.user || !item._id.month) return;

      const monthKey = `${item._id.year}-${String(item._id.month).padStart(2, '0')}`;
      const weekNum = item._id.week ? Math.ceil((item._id.week % 4) || 4) : 1;
      const weekKey = getWeekLabel(weekNum);
      const userKey = item._id.user.toString();

      if (!monthlyData[monthKey]) monthlyData[monthKey] = {};
      if (!monthlyData[monthKey][weekKey]) monthlyData[monthKey][weekKey] = {};
      if (!monthlyData[monthKey][weekKey][userKey]) {
        monthlyData[monthKey][weekKey][userKey] = {
          loggedMinutes: 0,
          billedMinutes: 0,
          projects: new Set()
        };
      }

      monthlyData[monthKey][weekKey][userKey].billedMinutes += item.billedMinutes || 0;
    });

    // Process subtask logged time
    subtaskTimeData.forEach(item => {
      if (!deptBoardIds.includes(item._id.board?.toString())) return;
      if (!item._id.user || !item._id.month) return;

      const monthKey = `${item._id.year}-${String(item._id.month).padStart(2, '0')}`;
      const weekNum = item._id.week ? Math.ceil((item._id.week % 4) || 4) : 1;
      const weekKey = getWeekLabel(weekNum);
      const userKey = item._id.user.toString();

      if (!monthlyData[monthKey]) monthlyData[monthKey] = {};
      if (!monthlyData[monthKey][weekKey]) monthlyData[monthKey][weekKey] = {};
      if (!monthlyData[monthKey][weekKey][userKey]) {
        monthlyData[monthKey][weekKey][userKey] = {
          loggedMinutes: 0,
          billedMinutes: 0,
          projects: new Set()
        };
      }

      monthlyData[monthKey][weekKey][userKey].loggedMinutes += item.loggedMinutes || 0;
    });

    // Process nano-subtask logged time
    nanoTimeData.forEach(item => {
      if (!deptBoardIds.includes(item._id.board?.toString())) return;
      if (!item._id.user || !item._id.month) return;

      const monthKey = `${item._id.year}-${String(item._id.month).padStart(2, '0')}`;
      const weekNum = item._id.week ? Math.ceil((item._id.week % 4) || 4) : 1;
      const weekKey = getWeekLabel(weekNum);
      const userKey = item._id.user.toString();

      if (!monthlyData[monthKey]) monthlyData[monthKey] = {};
      if (!monthlyData[monthKey][weekKey]) monthlyData[monthKey][weekKey] = {};
      if (!monthlyData[monthKey][weekKey][userKey]) {
        monthlyData[monthKey][weekKey][userKey] = {
          loggedMinutes: 0,
          billedMinutes: 0,
          projects: new Set()
        };
      }

      monthlyData[monthKey][weekKey][userKey].loggedMinutes += item.loggedMinutes || 0;
    });

    // Calculate average hourly rate for department
    const deptHourlyRates = deptBoards
      .filter(b => b.billingCycle === 'hr' && b.hourlyPrice)
      .map(b => b.hourlyPrice);
    const avgHourlyRate = deptHourlyRates.length > 0 
      ? deptHourlyRates.reduce((a, b) => a + b, 0) / deptHourlyRates.length 
      : 0;

    // Transform to array format
    const months = [];
    Object.keys(monthlyData).sort().forEach(monthKey => {
      const weeks = [];
      const weekOrder = ['1st Week', '2nd Week', '3rd Week', '4th Week', '5th Week'];
      
      weekOrder.forEach(weekKey => {
        if (!monthlyData[monthKey][weekKey]) return;
        
        const users = [];
        Object.keys(monthlyData[monthKey][weekKey]).forEach(userKey => {
          const userData = monthlyData[monthKey][weekKey][userKey];
          const user = userMap[userKey];
          
          if (!user) return;

          const payment = calculatePayment(userData.billedMinutes, 'hr', avgHourlyRate, 0);

          users.push({
            userId: userKey,
            userName: user.name,
            userEmail: user.email,
            userAvatar: user.avatar,
            loggedTime: formatTime(userData.loggedMinutes),
            billedTime: formatTime(userData.billedMinutes),
            projectCount: userData.projects.size,
            payment: Math.round(payment * 100) / 100
          });
        });

        if (users.length > 0) {
          weeks.push({
            week: weekKey,
            users,
            totalLoggedMinutes: users.reduce((sum, u) => sum + u.loggedTime.totalMinutes, 0),
            totalBilledMinutes: users.reduce((sum, u) => sum + u.billedTime.totalMinutes, 0),
            totalPayment: users.reduce((sum, u) => sum + u.payment, 0)
          });
        }
      });

      if (weeks.length > 0) {
        const monthDate = new Date(monthKey + '-01');
        months.push({
          month: monthKey,
          monthLabel: monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
          weeks,
          totalLoggedMinutes: weeks.reduce((sum, w) => sum + w.totalLoggedMinutes, 0),
          totalBilledMinutes: weeks.reduce((sum, w) => sum + w.totalBilledMinutes, 0),
          totalPayment: weeks.reduce((sum, w) => sum + w.totalPayment, 0)
        });
      }
    });

    result.push({
      departmentId: dept._id,
      departmentName: dept.name,
      managers: dept.managers || [],
      projectCount: deptBoards.length,
      months,
      totalLoggedMinutes: months.reduce((sum, m) => sum + m.totalLoggedMinutes, 0),
      totalBilledMinutes: months.reduce((sum, m) => sum + m.totalBilledMinutes, 0),
      totalPayment: months.reduce((sum, m) => sum + m.totalPayment, 0)
    });
  }

  res.status(200).json({
    success: true,
    data: result,
    meta: {
      startDate: start,
      endDate: end,
      totalDepartments: result.length,
      filters: { userId, departmentId, projectId, billingType, projectCategory, status }
    }
  });
});

// @desc    Get Month Wise PM Report
// @route   GET /api/pm-sheet/month-wise
// @access  Private (Admin, Manager)
export const getMonthWiseReport = asyncHandler(async (req, res, next) => {
  const { 
    startDate, 
    endDate, 
    userId, 
    departmentId,
    projectId,
    billingType
  } = req.query;

  const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1);
  const end = endDate ? new Date(endDate) : new Date();
  end.setHours(23, 59, 59, 999);

  // Get accessible departments
  const accessibleDepts = await getAccessibleDepartments(req.user);
  const accessibleDeptIds = accessibleDepts.map(d => d._id);

  let deptFilter = { _id: { $in: accessibleDeptIds }, isActive: true };
  if (departmentId && departmentId !== 'all') {
    deptFilter._id = new mongoose.Types.ObjectId(departmentId);
  }

  const departments = await Department.find(deptFilter)
    .populate('managers', 'name email avatar')
    .populate('members', 'name email avatar')
    .lean();

  const boardMatch = {
    department: { $in: departments.map(d => d._id) }
  };
  if (projectId) boardMatch._id = new mongoose.Types.ObjectId(projectId);
  if (billingType) boardMatch.billingCycle = billingType;

  const boards = await Board.find(boardMatch)
    .populate('members', 'name email avatar')
    .lean();

  const boardIds = boards.map(b => b._id);

  // Aggregate billed time per user per month
  const billedTimeAggregation = await Card.aggregate([
    { $match: { board: { $in: boardIds } } },
    { $unwind: { path: '$billedTime', preserveNullAndEmptyArrays: false } },
    {
      $match: {
        'billedTime.date': { $gte: start, $lte: end },
        ...(userId && userId !== 'all' ? { 'billedTime.user': new mongoose.Types.ObjectId(userId) } : {})
      }
    },
    {
      $lookup: {
        from: 'boards',
        localField: 'board',
        foreignField: '_id',
        as: 'boardInfo'
      }
    },
    { $unwind: '$boardInfo' },
    {
      $group: {
        _id: {
          user: '$billedTime.user',
          department: '$boardInfo.department',
          year: { $year: '$billedTime.date' },
          month: { $month: '$billedTime.date' },
          week: { $week: '$billedTime.date' }
        },
        billedMinutes: {
          $sum: {
            $add: [
              { $multiply: [{ $ifNull: ['$billedTime.hours', 0] }, 60] },
              { $ifNull: ['$billedTime.minutes', 0] }
            ]
          }
        },
        projects: { $addToSet: '$board' },
        avgHourlyRate: { $avg: '$boardInfo.hourlyPrice' }
      }
    }
  ]);

  // Aggregate logged time per user per month (separate aggregation)
  const loggedTimeAggregation = await Card.aggregate([
    { $match: { board: { $in: boardIds } } },
    { $unwind: { path: '$loggedTime', preserveNullAndEmptyArrays: false } },
    {
      $match: {
        'loggedTime.date': { $gte: start, $lte: end },
        ...(userId && userId !== 'all' ? { 'loggedTime.user': new mongoose.Types.ObjectId(userId) } : {})
      }
    },
    {
      $lookup: {
        from: 'boards',
        localField: 'board',
        foreignField: '_id',
        as: 'boardInfo'
      }
    },
    { $unwind: '$boardInfo' },
    {
      $group: {
        _id: {
          user: '$loggedTime.user',
          department: '$boardInfo.department',
          year: { $year: '$loggedTime.date' },
          month: { $month: '$loggedTime.date' },
          week: { $week: '$loggedTime.date' }
        },
        loggedMinutes: {
          $sum: {
            $add: [
              { $multiply: [{ $ifNull: ['$loggedTime.hours', 0] }, 60] },
              { $ifNull: ['$loggedTime.minutes', 0] }
            ]
          }
        }
      }
    }
  ]);

  // Create lookup maps for billed and logged time
  const billedMap = {};
  billedTimeAggregation.forEach(item => {
    const key = `${item._id.user}-${item._id.department}-${item._id.year}-${item._id.month}-${item._id.week}`;
    billedMap[key] = item;
  });

  const loggedMap = {};
  loggedTimeAggregation.forEach(item => {
    const key = `${item._id.user}-${item._id.department}-${item._id.year}-${item._id.month}-${item._id.week}`;
    loggedMap[key] = item;
  });

  // Combine and get all unique keys
  const allKeys = new Set([...Object.keys(billedMap), ...Object.keys(loggedMap)]);
  
  // Build combined data
  const combinedData = [];
  allKeys.forEach(key => {
    const billed = billedMap[key];
    const logged = loggedMap[key];
    const baseItem = billed || logged;
    
    combinedData.push({
      _id: baseItem._id,
      billedMinutes: billed?.billedMinutes || 0,
      loggedMinutes: logged?.loggedMinutes || 0,
      projects: billed?.projects || [],
      avgHourlyRate: billed?.avgHourlyRate || 0
    });
  });

  // Group by user-department-year-month
  const monthlyMap = {};
  combinedData.forEach(item => {
    const monthKey = `${item._id.user}-${item._id.department}-${item._id.year}-${item._id.month}`;
    if (!monthlyMap[monthKey]) {
      monthlyMap[monthKey] = {
        _id: {
          user: item._id.user,
          department: item._id.department,
          year: item._id.year,
          month: item._id.month
        },
        weeks: [],
        totalBilledMinutes: 0,
        totalLoggedMinutes: 0,
        projectCount: 0,
        avgHourlyRate: item.avgHourlyRate,
        projectSet: new Set()
      };
    }
    
    monthlyMap[monthKey].weeks.push({
      week: item._id.week,
      billedMinutes: item.billedMinutes,
      loggedMinutes: item.loggedMinutes
    });
    monthlyMap[monthKey].totalBilledMinutes += item.billedMinutes;
    monthlyMap[monthKey].totalLoggedMinutes += item.loggedMinutes;
    if (item.projects) {
      item.projects.forEach(p => monthlyMap[monthKey].projectSet.add(p.toString()));
    }
  });

  // Get user info
  const userIds = [...new Set(Object.values(monthlyMap).map(item => item._id.user?.toString()).filter(Boolean))];
  const users = await User.find({ _id: { $in: userIds } }).select('name email avatar').lean();
  const userMap = {};
  users.forEach(u => { userMap[u._id.toString()] = u; });

  // Group by department
  const departmentResultMap = {};
  departments.forEach(d => {
    departmentResultMap[d._id.toString()] = {
      departmentId: d._id,
      departmentName: d.name,
      managers: d.managers || [],
      users: []
    };
  });

  Object.values(monthlyMap).forEach(item => {
    const deptId = item._id.department?.toString();
    const userId = item._id.user?.toString();
    const user = userMap[userId];
    
    if (departmentResultMap[deptId] && user) {
      // Calculate week-wise data
      const weekData = {};
      item.weeks.forEach(w => {
        const weekNum = Math.ceil((w.week % 4) || 4);
        const weekKey = getWeekLabel(weekNum);
        if (!weekData[weekKey]) {
          weekData[weekKey] = { billedMinutes: 0, loggedMinutes: 0 };
        }
        weekData[weekKey].billedMinutes += w.billedMinutes;
        weekData[weekKey].loggedMinutes += w.loggedMinutes;
      });

      const payment = (item.totalBilledMinutes / 60) * (item.avgHourlyRate || 0);

      departmentResultMap[deptId].users.push({
        userId: item._id.user,
        userName: user.name,
        userEmail: user.email,
        userAvatar: user.avatar,
        year: item._id.year,
        month: item._id.month,
        monthLabel: new Date(item._id.year, item._id.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        weekWise: Object.keys(weekData).map(week => ({
          week,
          billedTime: formatTime(weekData[week].billedMinutes),
          loggedTime: formatTime(weekData[week].loggedMinutes)
        })),
        totalBilledTime: formatTime(item.totalBilledMinutes),
        totalLoggedTime: formatTime(item.totalLoggedMinutes),
        projectCount: item.projectSet.size,
        payment: Math.round(payment * 100) / 100
      });
    }
  });

  const result = Object.values(departmentResultMap).filter(d => d.users.length > 0);

  res.status(200).json({
    success: true,
    data: result,
    meta: {
      startDate: start,
      endDate: end,
      totalDepartments: result.length
    }
  });
});

// @desc    Get Project Coordinator Report (User-centric, coordinator-filtered)
// @route   GET /api/pm-sheet/coordinator-report
// @access  Private (Admin, Manager)
export const getCoordinatorReport = asyncHandler(async (req, res, next) => {
  const { 
    startDate, 
    endDate, 
    userId,
    departmentId,
    coordinatorId
  } = req.query;

  const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = endDate ? new Date(endDate) : new Date();
  end.setHours(23, 59, 59, 999);

  // Get accessible departments
  const accessibleDepts = await getAccessibleDepartments(req.user);
  const accessibleDeptIds = accessibleDepts.map(d => d._id);

  let deptFilter = { _id: { $in: accessibleDeptIds }, isActive: true };
  if (departmentId && departmentId !== 'all') {
    deptFilter._id = new mongoose.Types.ObjectId(departmentId);
  }

  const departments = await Department.find(deptFilter).lean();

  // Build board match
  const boardMatch = {
    department: { $in: departments.map(d => d._id) }
  };
  if (coordinatorId) {
    boardMatch.members = new mongoose.Types.ObjectId(coordinatorId);
  }

  const boards = await Board.find(boardMatch)
    .populate('members', 'name email avatar')
    .populate('owner', 'name email avatar')
    .lean();

  const boardIds = boards.map(b => b._id);
  const boardMap = {};
  boards.forEach(b => { boardMap[b._id.toString()] = b; });

  // Aggregate user-centric data
  const userAggregation = await Card.aggregate([
    { $match: { board: { $in: boardIds } } },
    { $unwind: { path: '$billedTime', preserveNullAndEmptyArrays: false } },
    {
      $match: {
        'billedTime.date': { $gte: start, $lte: end },
        ...(userId && userId !== 'all' ? { 'billedTime.user': new mongoose.Types.ObjectId(userId) } : {})
      }
    },
    {
      $group: {
        _id: {
          user: '$billedTime.user',
          board: '$board',
          year: { $year: '$billedTime.date' },
          month: { $month: '$billedTime.date' },
          week: { $week: '$billedTime.date' }
        },
        billedMinutes: {
          $sum: {
            $add: [
              { $multiply: [{ $ifNull: ['$billedTime.hours', 0] }, 60] },
              { $ifNull: ['$billedTime.minutes', 0] }
            ]
          }
        }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id.user',
        foreignField: '_id',
        as: 'userInfo'
      }
    },
    { $unwind: '$userInfo' },
    {
      $lookup: {
        from: 'boards',
        localField: '_id.board',
        foreignField: '_id',
        as: 'boardInfo'
      }
    },
    { $unwind: '$boardInfo' },
    {
      $group: {
        _id: '$_id.user',
        userName: { $first: '$userInfo.name' },
        userEmail: { $first: '$userInfo.email' },
        userAvatar: { $first: '$userInfo.avatar' },
        weeklyData: {
          $push: {
            year: '$_id.year',
            month: '$_id.month',
            week: '$_id.week',
            boardId: '$_id.board',
            projectName: '$boardInfo.name',
            billingType: '$boardInfo.billingCycle',
            hourlyRate: '$boardInfo.hourlyPrice',
            fixedPrice: '$boardInfo.fixedPrice',
            billedMinutes: '$billedMinutes',
            coordinators: '$boardInfo.members',
            department: '$boardInfo.department'
          }
        },
        totalBilledMinutes: { $sum: '$billedMinutes' }
      }
    },
    { $sort: { userName: 1 } }
  ]);

  // Process and structure data
  const result = userAggregation.map(user => {
    // Group by week
    const weeklyGroups = {};
    let totalPayment = 0;

    user.weeklyData.forEach(item => {
      const weekNum = Math.ceil((item.week % 4) || 4);
      const weekKey = `${item.year}-${String(item.month).padStart(2, '0')}-${getWeekLabel(weekNum)}`;
      
      if (!weeklyGroups[weekKey]) {
        weeklyGroups[weekKey] = {
          week: getWeekLabel(weekNum),
          month: new Date(item.year, item.month - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          projects: [],
          totalBilledMinutes: 0,
          totalPayment: 0
        };
      }

      const payment = item.billingType === 'fixed' 
        ? (item.fixedPrice || 0)
        : (item.billedMinutes / 60) * (item.hourlyRate || 0);

      // Get coordinators from the pre-populated boardMap instead of raw ObjectIds from aggregation
      const boardData = boardMap[item.boardId?.toString()];
      const populatedCoordinators = boardData?.members?.map(m => ({
        _id: m._id,
        name: m.name,
        email: m.email,
        avatar: m.avatar
      })) || [];

      weeklyGroups[weekKey].projects.push({
        projectId: item.boardId,
        projectName: item.projectName,
        billingType: item.billingType,
        hourlyRate: item.hourlyRate,
        billedTime: formatTime(item.billedMinutes),
        payment: Math.round(payment * 100) / 100,
        coordinators: populatedCoordinators
      });

      weeklyGroups[weekKey].totalBilledMinutes += item.billedMinutes;
      weeklyGroups[weekKey].totalPayment += payment;
      totalPayment += payment;
    });

    return {
      userId: user._id,
      userName: user.userName,
      userEmail: user.userEmail,
      userAvatar: user.userAvatar,
      weeks: Object.values(weeklyGroups).map(w => ({
        ...w,
        totalBilledTime: formatTime(w.totalBilledMinutes),
        totalPayment: Math.round(w.totalPayment * 100) / 100
      })),
      totalBilledTime: formatTime(user.totalBilledMinutes),
      totalPayment: Math.round(totalPayment * 100) / 100
    };
  });

  res.status(200).json({
    success: true,
    data: result,
    meta: {
      startDate: start,
      endDate: end,
      totalUsers: result.length,
      filters: { userId, departmentId, coordinatorId }
    }
  });
});

// @desc    Get Approach Page Data (Completed projects/work)
// @route   GET /api/pm-sheet/approach
// @access  Private (Admin, Manager)
export const getApproachData = asyncHandler(async (req, res, next) => {
  const { 
    startDate, 
    endDate, 
    userId,
    departmentId,
    projectId,
    status = 'completed'
  } = req.query;

  const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1);
  const end = endDate ? new Date(endDate) : new Date();
  end.setHours(23, 59, 59, 999);

  // Get accessible departments
  const accessibleDepts = await getAccessibleDepartments(req.user);
  const accessibleDeptIds = accessibleDepts.map(d => d._id);

  let deptFilter = { _id: { $in: accessibleDeptIds }, isActive: true };
  if (departmentId && departmentId !== 'all') {
    deptFilter._id = new mongoose.Types.ObjectId(departmentId);
  }

  const departments = await Department.find(deptFilter).lean();

  // Get completed projects
  const boardMatch = {
    department: { $in: departments.map(d => d._id) },
    status: status
  };
  if (projectId) boardMatch._id = new mongoose.Types.ObjectId(projectId);

  const boards = await Board.find(boardMatch)
    .populate('members', 'name email avatar')
    .populate('owner', 'name email avatar')
    .populate('department', 'name')
    .lean();

  const boardIds = boards.map(b => b._id);

  // Get all time data for completed projects
  const projectData = await Promise.all(boards.map(async (board) => {
    // Get card billed time
    const cardBilled = await Card.aggregate([
      { $match: { board: board._id } },
      { $unwind: { path: '$billedTime', preserveNullAndEmptyArrays: true } },
      {
        $match: {
          ...(userId && userId !== 'all' ? { 'billedTime.user': new mongoose.Types.ObjectId(userId) } : {}),
          $or: [
            { 'billedTime.date': { $gte: start, $lte: end } },
            { billedTime: null }
          ]
        }
      },
      {
        $group: {
          _id: '$billedTime.user',
          billedMinutes: {
            $sum: {
              $add: [
                { $multiply: [{ $ifNull: ['$billedTime.hours', 0] }, 60] },
                { $ifNull: ['$billedTime.minutes', 0] }
              ]
            }
          }
        }
      }
    ]);

    // Get subtask billed time
    const subtaskBilled = await Subtask.aggregate([
      { $match: { board: board._id } },
      { $unwind: { path: '$billedTime', preserveNullAndEmptyArrays: true } },
      {
        $match: {
          ...(userId && userId !== 'all' ? { 'billedTime.user': new mongoose.Types.ObjectId(userId) } : {}),
          $or: [
            { 'billedTime.date': { $gte: start, $lte: end } },
            { billedTime: null }
          ]
        }
      },
      {
        $group: {
          _id: '$billedTime.user',
          billedMinutes: {
            $sum: {
              $add: [
                { $multiply: [{ $ifNull: ['$billedTime.hours', 0] }, 60] },
                { $ifNull: ['$billedTime.minutes', 0] }
              ]
            }
          }
        }
      }
    ]);

    // Get nano-subtask billed time
    const nanoBilled = await SubtaskNano.aggregate([
      { $match: { board: board._id } },
      { $unwind: { path: '$billedTime', preserveNullAndEmptyArrays: true } },
      {
        $match: {
          ...(userId && userId !== 'all' ? { 'billedTime.user': new mongoose.Types.ObjectId(userId) } : {}),
          $or: [
            { 'billedTime.date': { $gte: start, $lte: end } },
            { billedTime: null }
          ]
        }
      },
      {
        $group: {
          _id: '$billedTime.user',
          billedMinutes: {
            $sum: {
              $add: [
                { $multiply: [{ $ifNull: ['$billedTime.hours', 0] }, 60] },
                { $ifNull: ['$billedTime.minutes', 0] }
              ]
            }
          }
        }
      }
    ]);

    // Combine all billed time
    const userBilledMap = {};
    [...cardBilled, ...subtaskBilled, ...nanoBilled].forEach(item => {
      if (!item._id) return;
      const key = item._id.toString();
      if (!userBilledMap[key]) userBilledMap[key] = 0;
      userBilledMap[key] += item.billedMinutes || 0;
    });

    const totalBilledMinutes = Object.values(userBilledMap).reduce((a, b) => a + b, 0);
    const payment = board.billingCycle === 'fixed'
      ? (board.fixedPrice || 0)
      : (totalBilledMinutes / 60) * (board.hourlyPrice || 0);

    // Get last activity
    const lastCard = await Card.findOne({ board: board._id })
      .sort({ updatedAt: -1 })
      .select('title updatedAt')
      .lean();

    return {
      projectId: board._id,
      projectName: board.name,
      projectSource: board.projectSource,
      upworkId: board.upworkId,
      projectCategory: board.projectCategory,
      billingType: board.billingCycle,
      hourlyRate: board.hourlyPrice,
      fixedPrice: board.fixedPrice,
      estimatedTime: board.estimatedTime,
      startDate: board.startDate,
      status: board.status,
      department: board.department,
      clientDetails: board.clientDetails,
      coordinators: board.members?.slice(0, 5) || [],
      totalCoordinators: board.members?.length || 0,
      totalBilledTime: formatTime(totalBilledMinutes),
      totalPayment: Math.round(payment * 100) / 100,
      lastActivity: lastCard ? {
        title: lastCard.title,
        date: lastCard.updatedAt
      } : null,
      userBreakdown: Object.entries(userBilledMap).map(([userId, minutes]) => ({
        userId,
        billedTime: formatTime(minutes)
      }))
    };
  }));

  // Calculate totals
  const totalBilledMinutes = projectData.reduce((sum, p) => sum + p.totalBilledTime.totalMinutes, 0);
  const totalPayment = projectData.reduce((sum, p) => sum + p.totalPayment, 0);

  res.status(200).json({
    success: true,
    data: {
      projects: projectData,
      summary: {
        totalProjects: projectData.length,
        totalBilledTime: formatTime(totalBilledMinutes),
        totalPayment: Math.round(totalPayment * 100) / 100
      }
    },
    meta: {
      startDate: start,
      endDate: end,
      filters: { userId, departmentId, projectId, status }
    }
  });
});

// @desc    Get filter options (users, departments, projects, etc.)
// @route   GET /api/pm-sheet/filters
// @access  Private (Admin, Manager)
export const getFilterOptions = asyncHandler(async (req, res, next) => {
  const accessibleDepts = await getAccessibleDepartments(req.user);
  const accessibleDeptIds = accessibleDepts.map(d => d._id);

  // Get departments
  const departments = await Department.find({ 
    _id: { $in: accessibleDeptIds },
    isActive: true 
  })
    .select('name')
    .lean();

  // Get users from accessible departments
  const users = await User.find({
    $or: [
      { department: { $in: accessibleDeptIds } },
      { role: 'admin' }
    ],
    isActive: true
  })
    .select('name email avatar department role')
    .lean();

  // Get projects from accessible departments
  const projects = await Board.find({
    department: { $in: accessibleDeptIds }
  })
    .select('name department billingCycle projectCategory projectSource status members')
    .populate('members', 'name email avatar')
    .lean();

  // Get unique categories
  const categories = [...new Set(projects.map(p => p.projectCategory).filter(Boolean))];

  // Get unique project sources
  const sources = [...new Set(projects.map(p => p.projectSource).filter(Boolean))];

  // Get coordinators (unique members from all projects)
  const coordinatorMap = {};
  projects.forEach(p => {
    (p.members || []).forEach(m => {
      coordinatorMap[m._id.toString()] = m;
    });
  });
  const coordinators = Object.values(coordinatorMap);

  res.status(200).json({
    success: true,
    data: {
      departments: departments.map(d => ({ id: d._id, name: d.name })),
      users: users.map(u => ({ 
        id: u._id, 
        name: u.name, 
        email: u.email, 
        avatar: u.avatar,
        department: u.department,
        role: u.role
      })),
      projects: projects.map(p => ({ 
        id: p._id, 
        name: p.name, 
        department: p.department,
        billingType: p.billingCycle,
        category: p.projectCategory,
        source: p.projectSource,
        status: p.status
      })),
      categories,
      sources,
      coordinators: coordinators.map(c => ({
        id: c._id,
        name: c.name,
        email: c.email,
        avatar: c.avatar
      })),
      billingTypes: [
        { value: 'hr', label: 'Hourly' },
        { value: 'fixed', label: 'Fixed' }
      ],
      statuses: [
        { value: 'planning', label: 'Planning' },
        { value: 'in-progress', label: 'In Progress' },
        { value: 'completed', label: 'Completed' },
        { value: 'on-hold', label: 'On Hold' }
      ]
    }
  });
});

// @desc    Update project status
// @route   PATCH /api/pm-sheet/project/:projectId/status
// @access  Private (Admin, Manager)
export const updateProjectStatus = asyncHandler(async (req, res, next) => {
  const { projectId } = req.params;
  const { status } = req.body;

  const validStatuses = ['planning', 'in-progress', 'completed', 'on-hold'];
  if (!validStatuses.includes(status)) {
    return next(new ErrorResponse('Invalid status value', 400));
  }

  const board = await Board.findById(projectId);
  if (!board) {
    return next(new ErrorResponse('Project not found', 404));
  }

  // Check if user has access to this department
  const accessibleDepts = await getAccessibleDepartments(req.user);
  const accessibleDeptIds = accessibleDepts.map(d => d._id.toString());
  
  if (!accessibleDeptIds.includes(board.department.toString())) {
    return next(new ErrorResponse('Not authorized to update this project', 403));
  }

  board.status = status;
  await board.save();

  res.status(200).json({
    success: true,
    data: {
      projectId: board._id,
      status: board.status
    }
  });
});

// @desc    Get summary statistics for PM Sheet
// @route   GET /api/pm-sheet/summary
// @access  Private (Admin, Manager)
export const getSummaryStats = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = endDate ? new Date(endDate) : new Date();
  end.setHours(23, 59, 59, 999);

  const accessibleDepts = await getAccessibleDepartments(req.user);
  const accessibleDeptIds = accessibleDepts.map(d => d._id);

  // Get total projects
  const totalProjects = await Board.countDocuments({
    department: { $in: accessibleDeptIds }
  });

  // Get active projects
  const activeProjects = await Board.countDocuments({
    department: { $in: accessibleDeptIds },
    status: { $in: ['planning', 'in-progress'] }
  });

  // Get completed projects
  const completedProjects = await Board.countDocuments({
    department: { $in: accessibleDeptIds },
    status: 'completed'
  });

  // Get total users
  const totalUsers = await User.countDocuments({
    $or: [
      { department: { $in: accessibleDeptIds } },
      { role: 'admin' }
    ],
    isActive: true
  });

  // Get total billed time this period
  const boards = await Board.find({ department: { $in: accessibleDeptIds } });
  const boardIds = boards.map(b => b._id);

  const billedTimeAgg = await Card.aggregate([
    { $match: { board: { $in: boardIds } } },
    { $unwind: { path: '$billedTime', preserveNullAndEmptyArrays: false } },
    { $match: { 'billedTime.date': { $gte: start, $lte: end } } },
    {
      $group: {
        _id: null,
        totalMinutes: {
          $sum: {
            $add: [
              { $multiply: [{ $ifNull: ['$billedTime.hours', 0] }, 60] },
              { $ifNull: ['$billedTime.minutes', 0] }
            ]
          }
        }
      }
    }
  ]);

  const totalBilledMinutes = billedTimeAgg[0]?.totalMinutes || 0;

  // Calculate total payment (estimated based on average hourly rate)
  const avgHourlyRate = await Board.aggregate([
    { 
      $match: { 
        department: { $in: accessibleDeptIds },
        billingCycle: 'hr',
        hourlyPrice: { $gt: 0 }
      } 
    },
    { $group: { _id: null, avgRate: { $avg: '$hourlyPrice' } } }
  ]);

  const rate = avgHourlyRate[0]?.avgRate || 0;
  const estimatedPayment = (totalBilledMinutes / 60) * rate;

  res.status(200).json({
    success: true,
    data: {
      totalProjects,
      activeProjects,
      completedProjects,
      totalUsers,
      totalDepartments: accessibleDeptIds.length,
      totalBilledTime: formatTime(totalBilledMinutes),
      estimatedPayment: Math.round(estimatedPayment * 100) / 100,
      period: { start, end }
    }
  });
});
