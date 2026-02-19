import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import mongoose from 'mongoose';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import Activity from '../models/Activity.js';
import Board from '../models/Board.js';
import List from '../models/List.js';
import Label from '../models/Label.js';
import Department from '../models/Department.js';
import User from '../models/User.js';
import Comment from '../models/Comment.js';
import Attachment from '../models/Attachment.js';
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

// Helper: Re-map labels from source board to destination board
const remapLabels = async (labelIds, sourceBoardId, destBoardId) => {
  if (!labelIds || labelIds.length === 0) return [];
  if (sourceBoardId.toString() === destBoardId.toString()) return labelIds;
  const sourceLabels = await Label.find({ _id: { $in: labelIds } }).lean();
  const newLabelIds = [];
  for (const sl of sourceLabels) {
    const dl = await Label.findOneAndUpdate(
      { board: destBoardId, name: sl.name, color: sl.color },
      { $setOnInsert: { board: destBoardId, name: sl.name, color: sl.color, createdBy: sl.createdBy } },
      { upsert: true, new: true }
    );
    newLabelIds.push(dl._id);
  }
  return newLabelIds;
};

// @desc    Promote subtask to a normal card (copy/move from subtask detail)
// @route   POST /api/subtasks/:id/promote
// @access  Private (Admin/Manager)
export const promoteSubtask = asyncHandler(async (req, res, next) => {
  const { destinationBoardId, destinationListId, options = {} } = req.body;
  const {
    copyComments = true,
    copyAttachments = true,
    copyAssignees = true,
    copyDueDates = true
  } = options;

  const subtask = await Subtask.findById(req.params.id).populate('task', 'title board').lean();
  if (!subtask) {
    return next(new ErrorResponse('Subtask not found', 404));
  }

  const destBoard = await Board.findById(destinationBoardId).select('name department').lean();
  if (!destBoard) {
    return next(new ErrorResponse('Destination project not found', 404));
  }

  const destList = await List.findById(destinationListId);
  if (!destList) {
    return next(new ErrorResponse('Destination list not found', 404));
  }

  // Get position
  const maxPosCard = await Card.findOne({ list: destinationListId, isArchived: false })
    .sort({ position: -1 }).select('position').lean();
  const newPosition = (maxPosCard?.position ?? -1) + 1;

  // Re-map labels/tags
  const newLabels = await remapLabels(subtask.tags, subtask.board, destinationBoardId);

  // Create a new Card from the subtask data
  const newCard = await Card.create({
    title: subtask.title,
    description: subtask.description || '',
    list: destinationListId,
    board: destinationBoardId,
    position: newPosition,
    assignees: copyAssignees ? (subtask.assignees || []) : [],
    members: [],
    labels: newLabels,
    priority: subtask.priority,
    status: destList.title.toLowerCase().replace(/\s+/g, '-'),
    dueDate: copyDueDates ? subtask.dueDate : null,
    startDate: copyDueDates ? subtask.startDate : null,
    attachments: copyAttachments ? (subtask.attachments || []) : [],
    estimationTime: [],
    loggedTime: [],
    billedTime: [],
    isArchived: false,
    createdBy: req.user.id,
    createdFrom: 'board'
  });

  // Convert nano-subtasks → subtasks of the new card
  const nanos = await SubtaskNano.find({ subtask: subtask._id }).lean();
  if (nanos.length > 0) {
    const subtaskDocs = nanos.map((n, i) => ({
      task: newCard._id,
      board: destinationBoardId,
      title: n.title,
      description: n.description,
      status: n.status,
      priority: n.priority,
      assignees: copyAssignees ? (n.assignees || []) : [],
      watchers: [],
      tags: [],
      dueDate: copyDueDates ? n.dueDate : null,
      startDate: copyDueDates ? n.startDate : null,
      attachments: copyAttachments ? (n.attachments || []) : [],
      colorToken: 'purple',
      estimationTime: [],
      loggedTime: [],
      billedTime: [],
      order: i,
      createdBy: req.user.id,
      breadcrumbs: { project: destBoard.name, task: newCard.title }
    }));
    await Subtask.insertMany(subtaskDocs);

    // Update subtask stats
    const totalSt = subtaskDocs.length;
    const completedSt = subtaskDocs.filter(s => ['done', 'closed'].includes(s.status)).length;
    await Card.findByIdAndUpdate(newCard._id, {
      subtaskStats: { total: totalSt, completed: completedSt, nanoTotal: 0, nanoCompleted: 0 }
    });
  }

  // Copy comments from subtask to new card if requested
  if (copyComments) {
    const comments = await Comment.find({ subtask: subtask._id, contextType: 'subtask' }).lean();
    if (comments.length > 0) {
      const cDocs = comments.map(c => ({
        text: c.text,
        htmlContent: c.htmlContent,
        card: newCard._id,
        contextType: 'card',
        contextRef: newCard._id,
        user: c.user,
        mentions: c.mentions || [],
        attachments: c.attachments || [],
        isEdited: false,
        editHistory: [],
        reactions: [],
        isPinned: false,
        replyCount: 0
      }));
      await Comment.insertMany(cDocs);
    }
  }

  // Copy attachment model records
  if (copyAttachments) {
    const atts = await Attachment.find({ contextRef: subtask._id, contextType: 'subtask', isDeleted: false }).lean();
    if (atts.length > 0) {
      const aDocs = atts.map(a => ({
        fileName: a.fileName,
        originalName: a.originalName,
        fileType: a.fileType,
        mimeType: a.mimeType,
        fileSize: a.fileSize,
        url: a.url,
        secureUrl: a.secureUrl,
        publicId: a.publicId,
        resourceType: a.resourceType,
        format: a.format,
        thumbnailUrl: a.thumbnailUrl,
        previewUrl: a.previewUrl,
        contextType: 'card',
        contextRef: newCard._id,
        card: newCard._id,
        board: destinationBoardId,
        uploadedBy: a.uploadedBy,
        width: a.width,
        height: a.height,
        fileExtension: a.fileExtension,
        isCover: false,
        isDeleted: false,
        departmentId: destBoard.department
      }));
      await Attachment.insertMany(aDocs);
    }
  }

  // Populate for response
  const populatedCard = await Card.findById(newCard._id)
    .populate('assignees', 'name email avatar')
    .populate('members', 'name email avatar')
    .populate('createdBy', 'name email avatar')
    .lean();

  res.status(201).json({
    success: true,
    data: populatedCard,
    message: 'Subtask promoted to task successfully'
  });

  // Background: delete original subtask and nanos, update parent card stats, emit events
  (async () => {
    try {
      const parentTaskId = subtask.task?._id || subtask.task;
      const parentBoardId = subtask.board;

      // Delete nano subtasks, then the subtask itself
      await SubtaskNano.deleteMany({ subtask: subtask._id });
      await Subtask.findByIdAndDelete(subtask._id);

      // Refresh parent card stats
      await refreshCardHierarchyStats(parentTaskId);

      // Emit hierarchy change to source board
      emitToBoard(parentBoardId.toString(), 'hierarchy-subtask-changed', {
        type: 'deleted',
        taskId: parentTaskId,
        subtaskId: subtask._id
      });

      // Emit card-created to destination board
      emitToBoard(destinationBoardId.toString(), 'task-copied', {
        card: populatedCard,
        listId: destinationListId,
        copiedBy: { id: req.user.id, name: req.user.name },
        isPromotion: true
      });

      // Activity
      await Activity.create({
        type: 'subtask_promoted',
        description: `Promoted subtask "${subtask.title}" to task in "${destBoard.name}"`,
        user: req.user.id,
        board: destinationBoardId,
        card: newCard._id,
        list: destinationListId,
        contextType: 'task',
        metadata: {
          sourceSubtaskId: subtask._id,
          sourceTaskId: parentTaskId,
          sourceBoardId: parentBoardId
        }
      });

      // Update recent destinations
      const deptName = (await Department.findById(destBoard.department).select('name').lean())?.name || '';
      const user = await User.findById(req.user.id);
      if (user) {
        const dests = user.recentCopyMoveDestinations || [];
        const filtered = dests.filter(d =>
          !(d.departmentId?.toString() === destBoard.department?.toString() &&
            d.projectId?.toString() === destinationBoardId?.toString() &&
            d.listId?.toString() === destinationListId?.toString())
        );
        filtered.unshift({
          departmentId: destBoard.department,
          departmentName: deptName,
          projectId: destinationBoardId,
          projectName: destBoard.name,
          listId: destinationListId,
          listName: destList.title,
          usedAt: new Date()
        });
        user.recentCopyMoveDestinations = filtered.slice(0, 5);
        await user.save();
      }

      invalidateHierarchyCache({ boardId: parentBoardId, cardId: parentTaskId });
      invalidateHierarchyCache({ boardId: destinationBoardId, listId: destinationListId, cardId: newCard._id });
    } catch (bgErr) {
      console.error('Error in promoteSubtask background:', bgErr);
    }
  })();
});


