import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import mongoose from 'mongoose';
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
import { processTimeEntriesWithOwnership } from '../utils/timeEntryUtils.js';
import { emitFinanceDataRefresh } from '../utils/socketEmitter.js';

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

  /**
   * Process time tracking updates with strict ownership preservation
   * Uses centralized utility for consistent ownership rules across all entities
   * 
   * CRITICAL RULES:
   * - Only the creator can edit/delete their entries
   * - Other users' entries are always preserved
   * - New entries are always assigned to req.user
   */
  const currentUser = { id: req.user.id, name: req.user.name };
  const timeEntryWarnings = [];

  // Process time entries with try-catch for validation errors
  let processedEstimationTime, processedLoggedTime, processedBilledTime;
  try {
    if (req.body.estimationTime !== undefined) {
      const result = processTimeEntriesWithOwnership(
        req.body.estimationTime,
        subtask.estimationTime,
        currentUser,
        'estimation'
      );
      processedEstimationTime = result.entries;
      if (result.errors.length > 0) {
        timeEntryWarnings.push(...result.errors);
      }
    } else {
      processedEstimationTime = subtask.estimationTime;
    }
    
    if (req.body.loggedTime !== undefined) {
      const result = processTimeEntriesWithOwnership(
        req.body.loggedTime,
        subtask.loggedTime,
        currentUser,
        'logged'
      );
      processedLoggedTime = result.entries;
      if (result.errors.length > 0) {
        timeEntryWarnings.push(...result.errors);
      }
    } else {
      processedLoggedTime = subtask.loggedTime;
    }
    
    if (req.body.billedTime !== undefined) {
      const result = processTimeEntriesWithOwnership(
        req.body.billedTime,
        subtask.billedTime,
        currentUser,
        'billed'
      );
      processedBilledTime = result.entries;
      if (result.errors.length > 0) {
        timeEntryWarnings.push(...result.errors);
      }
    } else {
      processedBilledTime = subtask.billedTime;
    }
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
    },

    // Emit finance data refresh for time tracking changes
    () => {
      if (req.body.loggedTime !== undefined || req.body.billedTime !== undefined) {
        emitFinanceDataRefresh({
          changeType: req.body.billedTime !== undefined ? 'billed_time' : 'logged_time',
          subtaskId: subtask._id.toString(),
          cardId: taskId.toString(),
          boardId: boardId.toString()
        });
      }
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

// @desc    Add time tracking entry
// @route   POST /api/subtasks/:id/time-tracking
// @access  Private
export const addTimeEntry = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { type, entry } = req.body;

  if (!['estimation', 'logged', 'billed'].includes(type)) {
    return next(new ErrorResponse('Invalid time entry type', 400));
  }

  const subtask = await Subtask.findById(id);
  if (!subtask) {
    return next(new ErrorResponse('Subtask not found', 404));
  }

  const fieldName = `${type}Time`;
  
  const newEntry = {
    ...entry,
    user: req.user.id,
    _id: new mongoose.Types.ObjectId()
  };

  if (newEntry.hours) newEntry.hours = parseInt(newEntry.hours) || 0;
  if (newEntry.minutes) newEntry.minutes = parseInt(newEntry.minutes) || 0;

  subtask[fieldName].push(newEntry);
  await subtask.save();

  await subtask.populate(`${fieldName}.user`, 'name email avatar');
  const addedEntry = subtask[fieldName].find(e => e._id.toString() === newEntry._id.toString());
  
  await Activity.create({
    type: 'time_logged',
    description: `Added ${type} time entry (${newEntry.hours}h ${newEntry.minutes}m)`,
    user: req.user.id,
    board: subtask.board,
    card: subtask.task,
    subtask: subtask._id,
    contextType: 'subtask',
    metadata: {
        timeType: type,
        hours: newEntry.hours,
        minutes: newEntry.minutes
    }
  });

  // Emit event
  const fullSubtask = await Subtask.findById(id).populate(basePopulate);
  emitToBoard(subtask.board.toString(), 'hierarchy-subtask-changed', {
    type: 'updated',
    subtask: fullSubtask
  });
  
  refreshCardHierarchyStats(subtask.task);

  if (type === 'logged' || type === 'billed') {
    emitFinanceDataRefresh({
      changeType: type === 'billed' ? 'billed_time' : 'logged_time',
      subtaskId: subtask._id.toString(),
      cardId: subtask.task.toString(),
      boardId: subtask.board.toString()
    });
  }

  res.status(200).json({
    success: true,
    data: addedEntry
  });
});

// @desc    Update time tracking entry
// @route   PUT /api/subtasks/:id/time-tracking/:entryId
// @access  Private
export const updateTimeEntry = asyncHandler(async (req, res, next) => {
  const { id, entryId } = req.params;
  const { type, updates } = req.body;

  if (!['estimation', 'logged', 'billed'].includes(type)) {
    return next(new ErrorResponse('Invalid time entry type', 400));
  }

  const subtask = await Subtask.findById(id);
  if (!subtask) {
    return next(new ErrorResponse('Subtask not found', 404));
  }

  const fieldName = `${type}Time`;
  const entryIndex = subtask[fieldName].findIndex(e => e._id.toString() === entryId);

  if (entryIndex === -1) {
    return next(new ErrorResponse('Time entry not found', 404));
  }

  const entry = subtask[fieldName][entryIndex];

  if (entry.user.toString() !== req.user.id.toString()) {
     return next(new ErrorResponse('Not authorized to update this time entry', 403));
  }

  if (updates.hours !== undefined) entry.hours = parseInt(updates.hours) || 0;
  if (updates.minutes !== undefined) entry.minutes = parseInt(updates.minutes) || 0;
  if (updates.date !== undefined) entry.date = updates.date;
  if (updates.reason !== undefined && type === 'estimation') entry.reason = updates.reason;
  if (updates.description !== undefined && type !== 'estimation') entry.description = updates.description;

  await subtask.save();
  await subtask.populate(`${fieldName}.user`, 'name email avatar');
  const updatedEntry = subtask[fieldName][entryIndex];

  await Activity.create({
    type: 'time_logged',
    description: `Updated ${type} time entry`,
    user: req.user.id,
    board: subtask.board,
    card: subtask.task,
    subtask: subtask._id,
    contextType: 'subtask'
  });

  const fullSubtask = await Subtask.findById(id).populate(basePopulate);
  emitToBoard(subtask.board.toString(), 'hierarchy-subtask-changed', {
    type: 'updated',
    subtask: fullSubtask
  });

  refreshCardHierarchyStats(subtask.task);
  
  if (type === 'logged' || type === 'billed') {
    emitFinanceDataRefresh({
      changeType: type === 'billed' ? 'billed_time' : 'logged_time',
      subtaskId: subtask._id.toString(),
      cardId: subtask.task.toString(),
      boardId: subtask.board.toString()
    });
  }

  res.status(200).json({
    success: true,
    data: updatedEntry
  });
});

// @desc    Delete time tracking entry
// @route   DELETE /api/subtasks/:id/time-tracking/:entryId
// @access  Private
export const deleteTimeEntry = asyncHandler(async (req, res, next) => {
  const { id, entryId } = req.params;
  const { type } = req.query;

  if (!['estimation', 'logged', 'billed'].includes(type)) {
    return next(new ErrorResponse('Invalid time entry type', 400));
  }

  const subtask = await Subtask.findById(id);
  if (!subtask) {
    return next(new ErrorResponse('Subtask not found', 404));
  }

  const fieldName = `${type}Time`;
  const entryIndex = subtask[fieldName].findIndex(e => e._id.toString() === entryId);

  if (entryIndex === -1) {
    return next(new ErrorResponse('Time entry not found', 404));
  }

  const entry = subtask[fieldName][entryIndex];

  if (entry.user.toString() !== req.user.id.toString()) {
     return next(new ErrorResponse('Not authorized to delete this time entry', 403));
  }

  subtask[fieldName].splice(entryIndex, 1);
  await subtask.save();

  await Activity.create({
    type: 'time_logged',
    description: `Deleted ${type} time entry`,
    user: req.user.id,
    board: subtask.board,
    card: subtask.task,
    subtask: subtask._id,
    contextType: 'subtask'
  });

  const fullSubtask = await Subtask.findById(id).populate(basePopulate);
  emitToBoard(subtask.board.toString(), 'hierarchy-subtask-changed', {
    type: 'updated',
    subtask: fullSubtask
  });

  refreshCardHierarchyStats(subtask.task);

  if (type === 'logged' || type === 'billed') {
    emitFinanceDataRefresh({
      changeType: type === 'billed' ? 'billed_time' : 'logged_time',
      subtaskId: subtask._id.toString(),
      cardId: subtask.task.toString(),
      boardId: subtask.board.toString()
    });
  }

  res.status(200).json({
    success: true,
    data: { _id: entryId }
  });
});


