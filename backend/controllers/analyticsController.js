import Card from '../models/Card.js';
import Board from '../models/Board.js';
import Team from '../models/Team.js';
import Department from '../models/Department.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';

// @desc    Get team analytics
// @route   GET /api/analytics/team/:teamId
// @access  Private
export const getTeamAnalytics = asyncHandler(async (req, res, next) => {
  const team = await Team.findById(req.params.teamId);

  if (!team) {
    return next(new ErrorResponse('Team not found', 404));
  }

  // Get all boards for this team
  const boards = await Board.find({ team: team._id });
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

  res.status(200).json({
    success: true,
    data: {
      teamId: req.params.teamId,
      totalTasks,
      completedTasks,
      inProgressTasks,
      todoTasks,
      reviewTasks,
      overdueTasks: overdueTasks.length,
      completionRate,
      priorityBreakdown,
      avgCompletionTime,
      overdueTasksList: overdueTasks.map(c => ({
        id: c._id,
        title: c.title,
        dueDate: c.dueDate,
        priority: c.priority
      }))
    }
  });
});

// @desc    Get user analytics
// @route   GET /api/analytics/user/:userId
// @access  Private
export const getUserAnalytics = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;

  // Get all cards assigned to this user
  const cards = await Card.find({ assignees: userId });

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

  res.status(200).json({
    success: true,
    data: {
      userId,
      totalTasks,
      completedTasks,
      inProgressTasks,
      todoTasks,
      reviewTasks,
      overdueTasks: overdueTasks.length,
      completionRate,
      priorityBreakdown,
      avgCompletionTime,
      overdueTasksList: overdueTasks.map(c => ({
        id: c._id,
        title: c.title,
        dueDate: c.dueDate,
        priority: c.priority
      }))
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

  const boards = await Board.find({ department: departmentId }).populate('team', 'name');

  const projects = await Promise.all(boards.map(async (board) => {
    const cards = await Card.find({ board: board._id });
    const totalCards = cards.length;
    const completedCards = cards.filter(card => card.status === 'done').length;
    const progress = totalCards > 0 ? Math.round((completedCards / totalCards) * 100) : 0;

    let status = 'Planning';
    if (progress === 100) status = 'Completed';
    else if (progress > 0) status = 'In Progress';

    const dueDates = cards.map(card => card.dueDate).filter(date => date).sort((a, b) => new Date(b) - new Date(a));
    const dueDate = dueDates.length > 0 ? new Date(dueDates[0]).toISOString().split('T')[0] : null;

    return {
      id: board._id,
      name: board.name,
      description: board.description || 'Project description',
      department: board.department,
      team: board.team?.name || 'General',
      progress: progress,
      dueDate: dueDate,
      status: status,
      totalCards,
      completedCards,
      members: board.members || []
    };
  }));

  res.status(200).json({
    success: true,
    data: projects
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
        team: { $ifNull: [{ $arrayElemAt: ['$teamInfo.name', 0] }, 'General'] },
        members: 1,
        totalCards: { $size: '$cards' },
        completedCards: {
          $size: {
            $filter: {
              input: '$cards',
              cond: { $eq: ['$$this.status', 'done'] }
            }
          }
        },
        dueDate: {
          $ifNull: [
            {
              $dateToString: {
                format: '%Y-%m-%d',
                date: {
                  $max: {
                    $filter: {
                      input: '$cards.dueDate',
                      cond: { $ne: ['$$this', null] }
                    }
                  }
                }
              }
            },
            null
          ]
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
