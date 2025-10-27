import Card from '../models/Card.js';
import Board from '../models/Board.js';
import Team from '../models/Team.js';
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