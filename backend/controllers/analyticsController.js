import mongoose from 'mongoose';
import Card from '../models/Card.js';
import Board from '../models/Board.js';
import Team from '../models/Team.js';
import Department from '../models/Department.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';

// @desc    Get user analytics
// @route   GET /api/analytics/user/:userId
// @access  Private
export const getUserAnalytics = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const now = new Date();

  // Use aggregation pipeline for optimized single-query analytics
  const [analytics] = await Card.aggregate([
    { $match: { assignees: { $in: [new mongoose.Types.ObjectId(userId)] } } },
    {
      $facet: {
        // Status counts
        statusCounts: [
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ],
        // Priority breakdown
        priorityCounts: [
          {
            $group: {
              _id: '$priority',
              count: { $sum: 1 }
            }
          }
        ],
        // Overdue tasks
        overdueTasks: [
          {
            $match: {
              dueDate: { $lt: now },
              status: { $ne: 'done' }
            }
          },
          {
            $project: {
              id: '$_id',
              title: 1,
              dueDate: 1,
              priority: 1
            }
          }
        ],
        // Average completion time calculation
        completionTimeData: [
          {
            $match: {
              status: 'done',
              startDate: { $exists: true, $ne: null }
            }
          },
          {
            $project: {
              completionTime: { $subtract: ['$updatedAt', '$startDate'] }
            }
          },
          {
            $group: {
              _id: null,
              avgTime: { $avg: '$completionTime' },
              count: { $sum: 1 }
            }
          }
        ],
        // Total count
        totalCount: [
          { $count: 'total' }
        ]
      }
    }
  ]);

  // Process aggregation results
  const statusMap = {};
  (analytics?.statusCounts || []).forEach(s => { statusMap[s._id] = s.count; });

  const priorityMap = {};
  (analytics?.priorityCounts || []).forEach(p => { priorityMap[p._id] = p.count; });

  const totalTasks = analytics?.totalCount?.[0]?.total || 0;
  const completedTasks = statusMap['done'] || 0;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const avgTimeData = analytics?.completionTimeData?.[0];
  const avgCompletionTime = avgTimeData
    ? Math.round(avgTimeData.avgTime / (1000 * 60 * 60 * 24)) // Convert ms to days
    : 0;

  res.status(200).json({
    success: true,
    data: {
      userId,
      totalTasks,
      completedTasks,
      inProgressTasks: statusMap['in-progress'] || 0,
      todoTasks: statusMap['todo'] || 0,
      reviewTasks: statusMap['review'] || 0,
      overdueTasks: analytics?.overdueTasks?.length || 0,
      completionRate,
      priorityBreakdown: {
        low: priorityMap['low'] || 0,
        medium: priorityMap['medium'] || 0,
        high: priorityMap['high'] || 0,
        critical: priorityMap['critical'] || 0
      },
      avgCompletionTime,
      overdueTasksList: analytics?.overdueTasks || []
    }
  });
});

// @desc    Get board analytics
// @route   GET /api/analytics/board/:boardId
// @access  Private
export const getBoardAnalytics = asyncHandler(async (req, res, next) => {
  const board = await Board.findById(req.params.boardId);

  if (!board) {
    return next(new ErrorResponse('Board not found', 404));
  }

  const cards = await Card.find({ board: board._id });

  const totalTasks = cards.length;
  const completedTasks = cards.filter(c => c.status === 'done').length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  res.status(200).json({
    success: true,
    data: {
      boardId: board._id,
      boardName: board.name,
      totalTasks,
      completedTasks,
      completionRate
    }
  });
});

// @desc    Get projects analytics by department
// @route   GET /api/analytics/projects/:departmentId
// @access  Private
export const getProjectsAnalytics = asyncHandler(async (req, res, next) => {
  const { departmentId } = req.params;

  let departmentIds = [];
  if (departmentId === 'all') {
    // Get all departments user has access to
    const user = req.user;
    let departmentQuery = {};
    if (user.role === 'manager') {
      departmentQuery._id = user.department;
    } else if (user.role !== 'admin') {
      departmentQuery.members = user._id;
    }
    const departments = await Department.find(departmentQuery).select('_id');
    departmentIds = departments.map(d => d._id);
  } else {
    departmentIds = [new mongoose.Types.ObjectId(departmentId)];
  }

  // Use aggregation pipeline to get all project data in a single query
  const projects = await Board.aggregate([
    {
      $match: {
        department: { $in: departmentIds }
      }
    },
    {
      $lookup: {
        from: 'teams',
        localField: 'team',
        foreignField: '_id',
        as: 'teamInfo',
        pipeline: [{ $project: { name: 1 } }]
      }
    },
    {
      $lookup: {
        from: 'cards',
        localField: '_id',
        foreignField: 'board',
        as: 'cards',
        pipeline: [
          { $project: { status: 1, dueDate: 1 } }
        ]
      }
    },
    {
      $project: {
        id: '$_id',
        name: 1,
        description: { $ifNull: ['$description', 'Project description'] },
        department: 1,
        team: { $ifNull: [{ $arrayElemAt: ['$teamInfo.name', 0] }, 'General'] },
        members: { $ifNull: ['$members', []] },
        totalCards: { $size: '$cards' },
        completedCards: {
          $size: {
            $filter: {
              input: '$cards',
              cond: { $eq: ['$$this.status', 'done'] }
            }
          }
        },
        // Get the latest due date
        dueDate: {
          $let: {
            vars: {
              dueDates: {
                $filter: {
                  input: '$cards.dueDate',
                  cond: { $ne: ['$$this', null] }
                }
              }
            },
            in: {
              $cond: {
                if: { $gt: [{ $size: '$$dueDates' }, 0] },
                then: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: { $max: '$$dueDates' }
                  }
                },
                else: null
              }
            }
          }
        }
      }
    },
    {
      $addFields: {
        progress: {
          $cond: {
            if: { $gt: ['$totalCards', 0] },
            then: { $round: { $multiply: [{ $divide: ['$completedCards', '$totalCards'] }, 100] } },
            else: 0
          }
        }
      }
    },
    {
      $addFields: {
        status: {
          $switch: {
            branches: [
              { case: { $eq: ['$progress', 100] }, then: 'Completed' },
              { case: { $gt: ['$progress', 0] }, then: 'In Progress' }
            ],
            default: 'Planning'
          }
        }
      }
    }
  ]);

  res.status(200).json({
    success: true,
    data: projects
  });
});

// @desc    Get department analytics
// @route   GET /api/analytics/department/:departmentId
// @access  Private
export const getDepartmentAnalytics = asyncHandler(async (req, res, next) => {
  let departments = [];
  let departmentName = '';

  if (req.params.departmentId === 'all') {
    // Get all departments user has access to
    const user = req.user;
    let departmentQuery = {};
    if (user.role === 'manager') {
      departmentQuery._id = user.department;
    } else if (user.role !== 'admin') {
      departmentQuery.members = user._id;
    }
    departments = await Department.find(departmentQuery);
    departmentName = 'All Departments';
  } else {
    const department = await Department.findById(req.params.departmentId);
    if (!department) {
      return next(new ErrorResponse('Department not found', 404));
    }
    departments = [department];
    departmentName = department.name;
  }

  // Get all boards for these departments
  const departmentIds = departments.map(d => d._id);
  const boards = await Board.find({ department: { $in: departmentIds } });
  const boardIds = boards.map(b => b._id);

  // Get all cards for these boards
  const cards = await Card.find({ board: { $in: boardIds } });

  // Calculate statistics
  const totalTasks = cards.length;
  const completedTasks = cards.filter(c => c.status === 'done').length;
  const inProgressTasks = cards.filter(c => c.status === 'in-progress').length;
  const todoTasks = cards.filter(c => c.status === 'todo').length;
  const reviewTasks = cards.filter(c => c.status === 'review').length;

  // Overdue tasks
  const now = new Date();
  const overdueTasks = cards.filter(c => c.dueDate && new Date(c.dueDate) < now && c.status !== 'done');

  // Priority breakdown
  const priorityBreakdown = {
    low: cards.filter(c => c.priority === 'low').length,
    medium: cards.filter(c => c.priority === 'medium').length,
    high: cards.filter(c => c.priority === 'high').length,
    critical: cards.filter(c => c.priority === 'critical').length
  };

  // Completion rate
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Average completion time
  const completedCards = cards.filter(c => c.status === 'done' && c.startDate);
  let avgCompletionTime = 0;
  if (completedCards.length > 0) {
    const totalTime = completedCards.reduce((sum, card) => {
      const start = new Date(card.startDate);
      const end = new Date(card.updatedAt);
      return sum + (end - start);
    }, 0);
    avgCompletionTime = Math.round(totalTime / completedCards.length / (1000 * 60 * 60 * 24)); // in days
  }

  // Time tracking analytics
  const timeAnalytics = {
    totalEstimatedHours: 0,
    totalLoggedHours: 0,
    timeVariance: 0
  };

  cards.forEach(card => {
    // Sum estimated time
    if (card.estimationTime && card.estimationTime.length > 0) {
      card.estimationTime.forEach(est => {
        timeAnalytics.totalEstimatedHours += est.hours + (est.minutes / 60);
      });
    }

    // Sum logged time
    if (card.loggedTime && card.loggedTime.length > 0) {
      card.loggedTime.forEach(log => {
        timeAnalytics.totalLoggedHours += log.hours + (log.minutes / 60);
      });
    }
  });

  timeAnalytics.timeVariance = timeAnalytics.totalEstimatedHours - timeAnalytics.totalLoggedHours;

  // Project breakdown
  const projectBreakdown = await Promise.all(boards.map(async (board) => {
    const projectCards = cards.filter(c => c.board.toString() === board._id.toString());
    const projectCompleted = projectCards.filter(c => c.status === 'done').length;
    const projectProgress = projectCards.length > 0 ? Math.round((projectCompleted / projectCards.length) * 100) : 0;

    return {
      id: board._id,
      name: board.name,
      totalTasks: projectCards.length,
      completedTasks: projectCompleted,
      progress: projectProgress,
      status: board.status
    };
  }));

  res.status(200).json({
    success: true,
    data: {
      departmentId: req.params.departmentId,
      departmentName,
      totalTasks,
      completedTasks,
      inProgressTasks,
      todoTasks,
      reviewTasks,
      overdueTasks: overdueTasks.length,
      completionRate,
      priorityBreakdown,
      avgCompletionTime,
      timeAnalytics,
      projectBreakdown,
      overdueTasksList: overdueTasks.map(c => ({
        id: c._id,
        title: c.title,
        dueDate: c.dueDate,
        priority: c.priority
      }))
    }
  });
});

// @desc    Get dashboard data with optimized aggregation
// @route   GET /api/analytics/dashboard
// @access  Private
export const getDashboardData = asyncHandler(async (req, res, next) => {
  const user = req.user;

  // Get all departments user has access to
  let departmentQuery = {};
  if (user.role === 'manager') {
    departmentQuery._id = user.department;
  } else if (user.role !== 'admin') {
    // For regular users, get departments they belong to
    departmentQuery.members = user._id;
  }

  const departments = await Department.find(departmentQuery);

  // Optimized aggregation pipeline with better performance
  const departmentIds = departments.map(d => d._id);

  const dashboardData = await Board.aggregate([
    {
      $match: {
        department: { $in: departmentIds },
        isArchived: { $ne: true } // More efficient than isArchived: false
      }
    },
    {
      $lookup: {
        from: 'departments',
        localField: 'department',
        foreignField: '_id',
        as: 'departmentInfo',
        pipeline: [
          { $project: { name: 1, _id: 1 } } // Only fetch needed fields
        ]
      }
    },
    {
      $lookup: {
        from: 'teams',
        localField: 'team',
        foreignField: '_id',
        as: 'teamInfo',
        pipeline: [
          { $project: { name: 1 } } // Only fetch needed fields
        ]
      }
    },
    {
      $lookup: {
        from: 'cards',
        localField: '_id',
        foreignField: 'board',
        as: 'cards',
        pipeline: [
          {
            $project: {
              status: 1,
              dueDate: 1,
              loggedTime: 1,
              _id: 0 // Exclude _id to reduce data transfer
            }
          }
        ]
      }
    },
    {
      $project: {
        id: '$_id',
        _id: 0, // Exclude _id from output
        name: 1,
        description: 1,
        department: { $arrayElemAt: ['$departmentInfo.name', 0] },
        departmentId: { $arrayElemAt: ['$departmentInfo._id', 0] },
        members: 1,
        status: 1, // Include the actual status field from Board model
        coverImage: 1, // Include cover image data
        coverImageHistory: 1, // Include cover image history
        priority: 1,
        totalCards: { $size: '$cards' },
        completedCards: {
          $size: {
            $filter: {
              input: '$cards',
              cond: { $eq: ['$$this.status', 'done'] }
            }
          }
        },
        totalLoggedTime: {
          $reduce: {
            input: '$cards',
            initialValue: { hours: 0, minutes: 0 },
            in: {
              hours: {
                $add: [
                  '$$value.hours',
                  {
                    $reduce: {
                      input: '$$this.loggedTime',
                      initialValue: 0,
                      in: { $add: ['$$value', '$$this.hours'] }
                    }
                  }
                ]
              },
              minutes: {
                $add: [
                  '$$value.minutes',
                  {
                    $reduce: {
                      input: '$$this.loggedTime',
                      initialValue: 0,
                      in: { $add: ['$$value', '$$this.minutes'] }
                    }
                  }
                ]
              }
            }
          }
        },
        dueDate: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$dueDate'
          }
        }
      }
    },
    {
      $addFields: {
        progress: {
          $cond: {
            if: { $gt: ['$totalCards', 0] },
            then: { $round: { $multiply: [{ $divide: ['$completedCards', '$totalCards'] }, 100] } },
            else: 0
          }
        },
        // Map the status enum values to display-friendly names
        status: {
          $switch: {
            branches: [
              { case: { $eq: ['$status', 'planning'] }, then: 'Planning' },
              { case: { $eq: ['$status', 'in-progress'] }, then: 'In Progress' },
              { case: { $eq: ['$status', 'completed'] }, then: 'Completed' },
              { case: { $eq: ['$status', 'on-hold'] }, then: 'On Hold' }
            ],
            default: 'Planning'
          }
        }
      }
    },
    {
      $sort: { createdAt: -1 }
    }
  ]);

  // Calculate stats
  const stats = {
    totalProjects: dashboardData.length,
    completedProjects: dashboardData.filter(p => p.status === 'Completed').length,
    inProgressProjects: dashboardData.filter(p => p.status === 'In Progress').length,
    planningProjects: dashboardData.filter(p => p.status === 'Planning').length
  };

  res.status(200).json({
    success: true,
    data: {
      projects: dashboardData,
      stats,
      departments: departments.map(d => ({ _id: d._id, name: d.name }))
    }
  });
});
