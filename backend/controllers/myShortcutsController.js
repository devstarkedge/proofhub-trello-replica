import mongoose from 'mongoose';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import Activity from '../models/Activity.js';
import Board from '../models/Board.js';
import Department from '../models/Department.js';
import Announcement from '../models/Announcement.js';
import { ErrorResponse } from '../middleware/errorHandler.js';

// Async handler wrapper to avoid try/catch in every controller
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * @desc    Get dashboard summary for My Shortcuts (batched data)
 * @route   GET /api/my-shortcuts/dashboard
 * @access  Private (user-scoped)
 */
export const getMyDashboardSummary = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;

  // Run all queries in parallel for performance
  const [taskCount, loggedTimeData, activityCount, projectCount, announcementCount] = await Promise.all([
    // 1. Count tasks assigned to user (check both assignees and members)
    Card.countDocuments({
      $or: [
        { assignees: userId },
        { members: userId }
      ],
      isArchived: { $ne: true }
    }),

    // 2. Get total logged time across all entities
    getMyTotalLoggedTime(userId),

    // 3. Count recent activities by user (last 7 days)
    Activity.countDocuments({
      user: userId,
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }),

    // 4. Count projects where user is assigned
    Board.countDocuments({
      members: userId,
      isArchived: { $ne: true }
    }),

    // 5. Count announcements for user (subscribers-based targeting)
    getAnnouncementCountForUser(userId, req.user.role, req.user.department)
  ]);

  res.status(200).json({
    success: true,
    data: {
      taskCount,
      loggedTime: loggedTimeData,
      activityCount,
      projectCount,
      announcementCount
    }
  });
});

/**
 * @desc    Get user's activities with pagination and grouping
 * @route   GET /api/my-shortcuts/activities
 * @access  Private (user-scoped)
 */
export const getMyActivities = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { 
    page = 1, 
    limit = 20, 
    type, 
    startDate, 
    endDate,
    grouped = false 
  } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  // Build query
  const query = { user: userId };
  
  if (type && type !== 'all') {
    query.type = type;
  }
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  // Get activities with population for navigation context
  const [activities, total] = await Promise.all([
    Activity.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('board', 'name department')
      .populate('card', 'title list')
      .populate('subtask', 'title')
      .populate('nanoSubtask', 'title')
      .lean(),
    Activity.countDocuments(query)
  ]);

  // Add navigation context to each activity
  const activitiesWithContext = await Promise.all(activities.map(async (activity) => {
    let navigationContext = null;
    
    if (activity.card) {
      const card = await Card.findById(activity.card._id)
        .populate({
          path: 'list',
          select: 'board',
          populate: { path: 'board', select: 'department' }
        })
        .lean();
      
      if (card?.list?.board) {
        navigationContext = {
          type: 'task',
          departmentId: card.list.board.department,
          projectId: card.list.board._id,
          taskId: card._id
        };
      }
    } else if (activity.board) {
      navigationContext = {
        type: 'project',
        departmentId: activity.board.department,
        projectId: activity.board._id
      };
    }

    return {
      ...activity,
      navigationContext
    };
  }));

  // Group activities if requested
  let result = activitiesWithContext;
  if (grouped === 'true') {
    result = groupActivitiesByType(activitiesWithContext);
  }

  res.status(200).json({
    success: true,
    data: {
      activities: result,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

/**
 * @desc    Get user's tasks grouped by project
 * @route   GET /api/my-shortcuts/tasks
 * @access  Private (user-scoped)
 */
export const getMyTasksGrouped = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;

  // Get all tasks assigned to user with project context (check both assignees and members)
  const tasks = await Card.find({
    $or: [
      { assignees: userId },
      { members: userId }
    ],
    isArchived: { $ne: true }
  })
    .populate({
      path: 'list',
      select: 'title board',
      populate: {
        path: 'board',
        select: 'name department',
        populate: { path: 'department', select: 'name' }
      }
    })
    .select('title description status priority dueDate labels list createdAt')
    .sort({ dueDate: 1, createdAt: -1 })
    .lean();

  // Group by project
  const groupedByProject = {};
  
  tasks.forEach(task => {
    if (!task.list?.board) return;
    
    const projectId = task.list.board._id.toString();
    
    if (!groupedByProject[projectId]) {
      groupedByProject[projectId] = {
        project: {
          _id: task.list.board._id,
          name: task.list.board.name,
          departmentId: task.list.board.department?._id,
          departmentName: task.list.board.department?.name
        },
        tasks: [],
        taskCount: 0
      };
    }
    
    groupedByProject[projectId].tasks.push({
      _id: task._id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      labels: task.labels,
      listName: task.list.title,
      navigationContext: {
        departmentId: task.list.board.department?._id,
        projectId: task.list.board._id,
        taskId: task._id
      }
    });
    groupedByProject[projectId].taskCount++;
  });

  // Convert to array and sort by task count
  const projectsWithTasks = Object.values(groupedByProject)
    .sort((a, b) => b.taskCount - a.taskCount);

  res.status(200).json({
    success: true,
    data: {
      totalTasks: tasks.length,
      projectCount: projectsWithTasks.length,
      projectsWithTasks
    }
  });
});

/**
 * @desc    Get user's assigned announcements
 * @route   GET /api/my-shortcuts/announcements
 * @access  Private (user-scoped)
 */
export const getMyAnnouncements = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Build announcement query based on subscriber targeting
  const query = await buildAnnouncementQuery(userId, req.user.role, req.user.department);

  const [announcements, total] = await Promise.all([
    Announcement.find(query)
      .sort({ isPinned: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'name avatar')
      .lean(),
    Announcement.countDocuments(query)
  ]);

  res.status(200).json({
    success: true,
    data: {
      announcements,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

/**
 * @desc    Get user's assigned projects
 * @route   GET /api/my-shortcuts/projects
 * @access  Private (user-scoped)
 */
export const getMyProjects = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [projects, total] = await Promise.all([
    Board.find({
      members: userId,
      isArchived: { $ne: true }
    })
      .populate('department', 'name')
      .select('name description status startDate endDate department background')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Board.countDocuments({
      members: userId,
      isArchived: { $ne: true }
    })
  ]);

  // Add navigation context
  const projectsWithContext = projects.map(project => ({
    ...project,
    navigationContext: {
      departmentId: project.department?._id,
      projectId: project._id
    }
  }));

  res.status(200).json({
    success: true,
    data: {
      projects: projectsWithContext,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

// ============ Helper Functions ============

/**
 * Get total logged time for a user across all entities
 */
async function getMyTotalLoggedTime(userId) {
  const aggregation = [
    {
      $match: {
        'loggedTime.user': userId
      }
    },
    { $unwind: '$loggedTime' },
    {
      $match: {
        'loggedTime.user': userId
      }
    },
    {
      $group: {
        _id: null,
        totalMinutes: {
          $sum: { $add: [{ $multiply: ['$loggedTime.hours', 60] }, '$loggedTime.minutes'] }
        },
        entryCount: { $sum: 1 }
      }
    }
  ];

  const [cardTime, subtaskTime, nanoTime] = await Promise.all([
    Card.aggregate(aggregation),
    Subtask.aggregate(aggregation),
    SubtaskNano.aggregate(aggregation)
  ]);

  const totalMinutes = (cardTime[0]?.totalMinutes || 0) +
                       (subtaskTime[0]?.totalMinutes || 0) +
                       (nanoTime[0]?.totalMinutes || 0);

  const totalEntries = (cardTime[0]?.entryCount || 0) +
                       (subtaskTime[0]?.entryCount || 0) +
                       (nanoTime[0]?.entryCount || 0);

  return {
    totalMinutes,
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
    formatted: `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`,
    entryCount: totalEntries
  };
}

/**
 * Group activities by type for timeline display
 */
function groupActivitiesByType(activities) {
  const groups = {};
  
  activities.forEach(activity => {
    const date = new Date(activity.createdAt).toISOString().split('T')[0];
    const key = `${date}-${activity.type}`;
    
    if (!groups[key]) {
      groups[key] = {
        date,
        type: activity.type,
        items: [],
        count: 0,
        firstActivity: activity
      };
    }
    
    groups[key].items.push(activity);
    groups[key].count++;
  });

  return Object.values(groups).sort((a, b) => 
    new Date(b.date) - new Date(a.date)
  );
}

/**
 * Build announcement query based on subscriber targeting
 */
async function buildAnnouncementQuery(userId, userRole, userDepartment) {
  const now = new Date();
  
  // Base query - not archived and not expired
  const baseQuery = {
    isArchived: { $ne: true },
    expiresAt: { $gte: now }
  };

  // Build subscriber conditions
  // User can see announcements if:
  // 1. subscribers.type is 'all'
  // 2. User is in subscribers.users array
  // 3. User's department is in subscribers.departments array
  // 4. User's role matches subscribers.roles array
  // 5. subscribers.type is 'managers' and user is a manager
  const subscriberConditions = [
    { 'subscribers.type': 'all' },
    { 'subscribers.users': userId }
  ];

  if (userDepartment) {
    subscriberConditions.push({ 'subscribers.departments': userDepartment });
  }

  if (userRole) {
    const roleLower = userRole.toLowerCase();
    subscriberConditions.push({ 'subscribers.roles': roleLower });
    
    if (roleLower === 'manager' || roleLower === 'admin') {
      subscriberConditions.push({ 'subscribers.type': 'managers' });
    }
  }

  return {
    ...baseQuery,
    $or: subscriberConditions
  };
}

/**
 * Get announcement count for user based on subscriber targeting
 */
async function getAnnouncementCountForUser(userId, userRole, userDepartment) {
  const query = await buildAnnouncementQuery(userId, userRole, userDepartment);
  return Announcement.countDocuments(query);
}
