import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import Activity from '../models/Activity.js';
import { emitToBoard } from '../server.js';
import { refreshCardHierarchyStats } from '../utils/hierarchyStats.js';
import { invalidateHierarchyCache } from '../utils/cacheInvalidation.js';
import { handleTaskCompletion } from '../utils/recurrenceScheduler.js';
import { batchCreateActivities, executeBackgroundTasks } from '../utils/activityLogger.js';
import { slackHooks } from '../utils/slackHooks.js';

const basePopulate = [
  { path: 'assignees', select: 'name email avatar' },
  { path: 'watchers', select: 'name email avatar' },
  { path: 'tags', select: 'name color' },
  { path: 'coverImage', select: 'url secureUrl publicId height width' },
  { path: 'estimationTime.user', select: 'name email avatar' },
  { path: 'loggedTime.user', select: 'name email avatar' },
  { path: 'billedTime.user', select: 'name email avatar' }
];

const buildBreadcrumbs = (card) => ({
  project: card?.board?.name || '',
  task: card?.title || ''
});

const getOrderedSubtasks = async (taskId) => {
  return Subtask.find({ task: taskId })
    .sort({ order: 1, createdAt: 1 })
    .populate(basePopulate);
};

export const getSubtasksForTask = asyncHandler(async (req, res, next) => {
  const { taskId } = req.params;
  const card = await Card.findById(taskId).populate('board', 'name');
  if (!card) {
    return next(new ErrorResponse('Task not found', 404));
  }

  const subtasks = await getOrderedSubtasks(taskId);

  res.status(200).json({
    success: true,
    data: subtasks
  });
});

export const getSubtaskById = asyncHandler(async (req, res, next) => {
  const subtask = await Subtask.findById(req.params.id)
    .populate(basePopulate)
    .populate({
      path: 'nanoSubtasks',
      options: { sort: { order: 1, createdAt: 1 } }
    });

  if (!subtask) {
    return next(new ErrorResponse('Subtask not found', 404));
  }

  res.status(200).json({
    success: true,
    data: subtask
  });
});

export const createSubtask = asyncHandler(async (req, res, next) => {
  const { taskId } = req.params;
  const card = await Card.findById(taskId).populate('board', 'name');
  if (!card) {
    return next(new ErrorResponse('Task not found', 404));
  }

  const currentCount = await Subtask.countDocuments({ task: taskId });
  const subtask = await Subtask.create({
    task: taskId,
    board: card.board,
    title: req.body.title,
    description: req.body.description,
    status: req.body.status || 'todo',
    priority: req.body.priority || 'medium',
    assignees: req.body.assignees || [],
    watchers: req.body.watchers || [],
    tags: req.body.tags || [],
    dueDate: req.body.dueDate,
    startDate: req.body.startDate,
    attachments: req.body.attachments || [],
    colorToken: req.body.colorToken || 'purple',
    estimationTime: req.body.estimationTime || [],
    loggedTime: req.body.loggedTime || [],
    billedTime: req.body.billedTime || [],
    order: req.body.order ?? currentCount,
    createdBy: req.user.id,
    breadcrumbs: buildBreadcrumbs(card)
  });

  const populated = await Subtask.findById(subtask._id).populate(basePopulate);

  // Parallelize secondary operations
  await Promise.all([
    // Log activity
    Activity.create({
      type: 'subtask_created',
      description: `Created subtask "${subtask.title}"`,
      user: req.user.id,
      board: card.board,
      card: taskId,
      subtask: subtask._id,
      contextType: 'subtask',
      metadata: {
        subtaskTitle: subtask.title,
        title: subtask.title
      }
    }),

    // Update stats
    refreshCardHierarchyStats(taskId),

    // Emit socket
    Promise.resolve().then(() => {
        emitToBoard(card.board.toString(), 'hierarchy-subtask-changed', {
            type: 'created',
            taskId,
            subtask: populated
        });
    }),

    // Invalidate cache
    Promise.resolve().then(() => {
        invalidateHierarchyCache({
            boardId: card.board,
            listId: card.list,
            cardId: taskId,
            subtaskId: subtask._id
        });
    })
  ]);

  res.status(201).json({
    success: true,
    data: populated
  });
});

export const updateSubtask = asyncHandler(async (req, res, next) => {
  let subtask = await Subtask.findById(req.params.id).populate('task').populate('board');
  if (!subtask) {
    return next(new ErrorResponse('Subtask not found', 404));
  }

  const oldSubtask = { ...subtask.toObject() };
  const taskId = subtask.task?._id || subtask.task;
  const boardId = subtask.board?._id || subtask.board;

  // Helper function to check if a string is a valid MongoDB ObjectId
  const isValidObjectId = (id) => {
    if (!id) return false;
    const str = id.toString();
    return /^[a-fA-F0-9]{24}$/.test(str);
  };

  /**
   * Helper function to get date string in YYYY-MM-DD format
   */
  const getDateString = (date) => {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  };

  /**
   * Process time tracking entries with strict ownership preservation and 24h validation
   * - New entries (no valid MongoDB _id): Always use authenticated user
   * - Existing entries (valid MongoDB _id): NEVER modify the user field - preserve original owner
   * - Validates 24h maximum per user per date
   * - Blocks future dates
   * This prevents the "last user overwrites all" bug
   */
  const processTimeEntries = (incomingEntries, existingEntries, entryType) => {
    if (!incomingEntries) return existingEntries || [];
    
    // Create a map of existing entries by their _id for quick lookup
    const existingMap = new Map();
    (existingEntries || []).forEach(entry => {
      if (entry._id) {
        existingMap.set(entry._id.toString(), entry);
      }
    });

    // Get today's date for future date validation
    const todayString = getDateString(new Date());

    // Track total time per date for 24h validation (for new entries only)
    // Start with existing entries' time
    const timePerDate = new Map();
    (existingEntries || []).forEach(entry => {
      const entryUserId = entry.user ? entry.user.toString() : null;
      if (entryUserId === req.user.id) {
        const entryDate = entry.date ? getDateString(entry.date) : todayString;
        const hours = parseInt(entry.hours || 0);
        const minutes = parseInt(entry.minutes || 0);
        const currentTotal = timePerDate.get(entryDate) || 0;
        timePerDate.set(entryDate, currentTotal + (hours * 60) + minutes);
      }
    });

    return incomingEntries.map(entry => {
      const entryId = entry._id ? entry._id.toString() : null;
      const isExistingEntry = entryId && isValidObjectId(entryId) && existingMap.has(entryId);

      if (isExistingEntry) {
        // EXISTING ENTRY: Preserve original owner, only allow updating time/description
        const originalEntry = existingMap.get(entryId);
        return {
          _id: entry._id,
          hours: entry.hours,
          minutes: entry.minutes,
          reason: entry.reason,
          description: entry.description,
          // CRITICAL: Always preserve original user from database
          user: originalEntry.user,
          userName: originalEntry.userName,
          date: originalEntry.date // Preserve original date
        };
      } else {
        // NEW ENTRY: Always use authenticated user (security enforcement)
        // Parse and validate date
        const entryDate = entry.date ? getDateString(entry.date) : todayString;
        
        // Block future dates
        if (entryDate > todayString) {
          throw new Error(`Cannot add time entries for future dates. Selected date: ${entryDate}`);
        }

        // Calculate new entry time
        const newHours = parseInt(entry.hours || 0);
        const newMinutes = parseInt(entry.minutes || 0);
        const newTimeMinutes = (newHours * 60) + newMinutes;

        // Get existing time for this date
        const existingMinutes = timePerDate.get(entryDate) || 0;
        const totalMinutes = existingMinutes + newTimeMinutes;
        const maxMinutes = 24 * 60; // 24 hours

        if (totalMinutes > maxMinutes) {
          const existingHours = Math.floor(existingMinutes / 60);
          const existingMins = existingMinutes % 60;
          throw new Error(`Total time for ${entryDate} cannot exceed 24 hours. You have already logged ${existingHours}h ${existingMins}m.`);
        }

        // Update tracked time for this date
        timePerDate.set(entryDate, totalMinutes);

        return {
          hours: newHours,
          minutes: newMinutes,
          reason: entry.reason,
          description: entry.description,
          // CRITICAL: New entries always get authenticated user
          user: req.user.id,
          userName: req.user.name,
          date: entry.date || new Date()
        };
      }
    });
  };

  // Process time entries with try-catch for validation errors
  let processedEstimationTime, processedLoggedTime, processedBilledTime;
  try {
    processedEstimationTime = processTimeEntries(req.body.estimationTime, subtask.estimationTime, 'estimation');
    processedLoggedTime = processTimeEntries(req.body.loggedTime, subtask.loggedTime, 'logged');
    processedBilledTime = processTimeEntries(req.body.billedTime, subtask.billedTime, 'billed');
  } catch (validationError) {
    return res.status(400).json({
      success: false,
      error: validationError.message
    });
  }

  const updates = {
    title: req.body.title ?? subtask.title,
    description: req.body.description ?? subtask.description,
    status: req.body.status ?? subtask.status,
    priority: req.body.priority ?? subtask.priority,
    assignees: req.body.assignees ?? subtask.assignees,
    watchers: req.body.watchers ?? subtask.watchers,
    tags: req.body.tags ?? subtask.tags,
    dueDate: req.body.dueDate ?? subtask.dueDate,
    startDate: req.body.startDate ?? subtask.startDate,
    attachments: req.body.attachments ?? subtask.attachments,
    colorToken: req.body.colorToken ?? subtask.colorToken,
    estimationTime: processedEstimationTime,
    loggedTime: processedLoggedTime,
    billedTime: processedBilledTime,
    updatedBy: req.user.id
  };

  if (req.body.order !== undefined) {
    updates.order = req.body.order;
  }

  subtask = await Subtask.findByIdAndUpdate(
    req.params.id,
    updates,
    { new: true }
  ).populate(basePopulate);

  // Send response immediately for better UX
  res.status(200).json({
    success: true,
    data: subtask
  });

  // Execute background tasks after response is sent
  executeBackgroundTasks([
    // Batch activity logging
    async () => {
      const activities = [];
      const baseActivity = {
        user: req.user.id,
        board: boardId,
        card: taskId,
        subtask: subtask._id,
        contextType: 'subtask'
      };

      if (oldSubtask.title !== subtask.title) {
        activities.push({
          ...baseActivity,
          type: 'title_changed',
          description: `Changed title from "${oldSubtask.title}" to "${subtask.title}"`
        });
      }
      if (oldSubtask.status !== subtask.status) {
        activities.push({
          ...baseActivity,
          type: 'status_changed',
          description: `Changed status from ${oldSubtask.status} to ${subtask.status}`
        });
        // Handle recurring task completion triggers
        if (subtask.status === 'done' || subtask.status === 'closed') {
          await handleTaskCompletion(subtask._id, subtask.status);
          
          // Send Slack notification for subtask completion
          const parentTask = await Card.findById(taskId).populate('board', 'name');
          if (parentTask) {
            slackHooks.onSubtaskCompleted(subtask, parentTask, parentTask.board, req.user).catch(console.error);
            
            // Check if all subtasks are completed
            const remainingSubtasks = await Subtask.countDocuments({ 
              task: taskId, 
              status: { $nin: ['done', 'closed'] }
            });
            if (remainingSubtasks === 0) {
              slackHooks.onAllSubtasksCompleted(parentTask, parentTask.board, req.user).catch(console.error);
            }
          }
        }
      }
      if (oldSubtask.priority !== subtask.priority) {
        activities.push({
          ...baseActivity,
          type: 'priority_changed',
          description: `Changed priority from ${oldSubtask.priority} to ${subtask.priority}`
        });
      }
      if (oldSubtask.description !== subtask.description) {
        activities.push({
          ...baseActivity,
          type: 'description_changed',
          description: 'Updated the description'
        });
      }
      if (oldSubtask.dueDate?.toString() !== subtask.dueDate?.toString()) {
        activities.push({
          ...baseActivity,
          type: 'due_date_changed',
          description: `Changed due date to ${subtask.dueDate}`
        });
      }
      if (JSON.stringify(oldSubtask.assignees) !== JSON.stringify(subtask.assignees)) {
        activities.push({
          ...baseActivity,
          type: 'member_added',
          description: 'Updated assignees'
        });
      }
      if (JSON.stringify(oldSubtask.loggedTime) !== JSON.stringify(subtask.loggedTime)) {
        activities.push({
          ...baseActivity,
          type: 'time_logged',
          description: 'Updated logged time'
        });
      }

      if (activities.length > 0) {
        await batchCreateActivities(activities);
      }
    },

    // Refresh hierarchy stats
    () => refreshCardHierarchyStats(taskId),

    // Emit socket event
    () => emitToBoard(boardId.toString(), 'hierarchy-subtask-changed', {
      type: 'updated',
      taskId: taskId.toString(),
      subtask
    }),

    // Invalidate cache
    async () => {
      const parentCard = await Card.findById(taskId).select('board list').lean();
      invalidateHierarchyCache({
        boardId: parentCard?.board || boardId,
        listId: parentCard?.list,
        cardId: taskId,
        subtaskId: subtask._id
      });
    }
  ]);
});

export const deleteSubtask = asyncHandler(async (req, res, next) => {
  const subtask = await Subtask.findById(req.params.id);
  if (!subtask) {
    return next(new ErrorResponse('Subtask not found', 404));
  }

  // Clean up related nanos
  await SubtaskNano.deleteMany({ subtask: subtask._id });

  const subtaskTitle = subtask.title;
  const taskId = subtask.task;
  const boardId = subtask.board;

  await subtask.deleteOne();

  // Log activity
  await Activity.create({
    type: 'subtask_deleted',
    description: `Deleted subtask "${subtaskTitle}"`,
    user: req.user.id,
    board: boardId,
    card: taskId,
    subtask: subtask._id,
    contextType: 'subtask',
    metadata: {
      subtaskTitle
    }
  });

  await refreshCardHierarchyStats(taskId);

  emitToBoard(boardId.toString(), 'hierarchy-subtask-changed', {
    type: 'deleted',
    taskId: taskId.toString(),
    subtaskId: subtask._id
  });

  const parentCard = await Card.findById(taskId);
  invalidateHierarchyCache({
    boardId: parentCard?.board || subtask.board,
    listId: parentCard?.list,
    cardId: subtask.task,
    subtaskId: subtask._id
  });

  res.status(200).json({
    success: true,
    message: 'Subtask deleted'
  });
});

export const reorderSubtasks = asyncHandler(async (req, res, next) => {
  const { taskId } = req.params;
  const { orderedIds } = req.body;

  if (!Array.isArray(orderedIds)) {
    return next(new ErrorResponse('orderedIds array is required', 400));
  }

  const updates = orderedIds.map((subtaskId, idx) =>
    Subtask.findByIdAndUpdate(subtaskId, { order: idx })
  );
  await Promise.all(updates);

  const subtasks = await getOrderedSubtasks(taskId);
  const card = await Card.findById(taskId);

  emitToBoard(card.board.toString(), 'hierarchy-subtask-changed', {
    type: 'reordered',
    taskId,
    subtasks
  });
  invalidateHierarchyCache({
    boardId: card.board,
    listId: card.list,
    cardId: card._id
  });

  res.status(200).json({
    success: true,
    data: subtasks
  });
});

// @desc    Get subtask activity logs
// @route   GET /api/subtasks/:id/activity
// @access  Private
export const getSubtaskActivity = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { limit = 100, page = 1 } = req.query;

  // Verify subtask exists
  const subtask = await Subtask.findById(id);
  if (!subtask) {
    return next(new ErrorResponse('Subtask not found', 404));
  }

  // Get all activities for this subtask - filter by both subtask reference and contextType
  const activities = await Activity.find({ 
    subtask: id,
    contextType: 'subtask'
  })
    .populate('user', 'name email avatar')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit));

  const total = await Activity.countDocuments({ 
    subtask: id,
    contextType: 'subtask'
  });

  res.status(200).json({
    success: true,
    count: activities.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    data: activities,
  });
});


