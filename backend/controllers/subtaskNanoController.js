import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import mongoose from 'mongoose';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import Activity from '../models/Activity.js';
import { emitToBoard } from '../server.js';
import { refreshCardHierarchyStats, refreshSubtaskNanoStats } from '../utils/hierarchyStats.js';
import { batchCreateActivities, executeBackgroundTasks } from '../utils/activityLogger.js';
import { processTimeEntriesWithOwnership } from '../utils/timeEntryUtils.js';
import { emitFinanceDataRefresh } from '../utils/socketEmitter.js';

const populateConfig = [
  { path: 'assignees', select: 'name email avatar' },
  { path: 'tags', select: 'name color' },
  { path: 'coverImage', select: 'url secureUrl publicId height width' },
  { path: 'estimationTime.user', select: 'name email avatar' },
  { path: 'loggedTime.user', select: 'name email avatar' },
  { path: 'billedTime.user', select: 'name email avatar' }
];

const getOrderedNanos = (subtaskId) => {
  return SubtaskNano.find({ subtask: subtaskId })
    .sort({ order: 1, createdAt: 1 })
    .populate(populateConfig);
};

export const getNanosForSubtask = asyncHandler(async (req, res, next) => {
  const { subtaskId } = req.params;
  const subtask = await Subtask.findById(subtaskId);
  if (!subtask) {
    return next(new ErrorResponse('Subtask not found', 404));
  }

  const nanos = await getOrderedNanos(subtaskId);
  res.status(200).json({
    success: true,
    data: nanos
  });
});

export const getNanoById = asyncHandler(async (req, res, next) => {
  const nano = await SubtaskNano.findById(req.params.id)
    .populate(populateConfig);

  if (!nano) {
    return next(new ErrorResponse('Subtask-Nano not found', 404));
  }

  res.status(200).json({
    success: true,
    data: nano
  });
});

export const createNano = asyncHandler(async (req, res, next) => {
  const { subtaskId } = req.params;
  const subtask = await Subtask.findById(subtaskId).populate('task board');
  if (!subtask) {
    return next(new ErrorResponse('Subtask not found', 404));
  }

  const card = await Card.findById(subtask.task).populate('board', 'name');

  const count = await SubtaskNano.countDocuments({ subtask: subtaskId });
  const nano = await SubtaskNano.create({
    subtask: subtaskId,
    task: subtask.task,
    board: subtask.board,
    title: req.body.title,
    description: req.body.description,
    status: req.body.status || 'todo',
    priority: req.body.priority || 'medium',
    assignees: req.body.assignees || [],
    dueDate: req.body.dueDate,
    startDate: req.body.startDate,
    tags: req.body.tags || [],
    attachments: req.body.attachments || [],
    colorToken: req.body.colorToken || 'pink',
    estimationTime: req.body.estimationTime || [],
    loggedTime: req.body.loggedTime || [],
    billedTime: req.body.billedTime || [],
    order: req.body.order ?? count,
    createdBy: req.user.id,
    breadcrumbs: {
      project: card?.board?.name || '',
      task: card?.title || '',
      subtask: subtask.title
    }
  });

  const populated = await SubtaskNano.findById(nano._id).populate(populateConfig);

  // Parallelize secondary operations
  await Promise.all([
    // Log activity
    Activity.create({
      type: 'nano_created',
      description: `Created nano-subtask "${nano.title}"`,
      user: req.user.id,
      board: subtask.board,
      card: subtask.task,
      subtask: subtaskId,
      nanoSubtask: nano._id,
      contextType: 'nanoSubtask',
      metadata: {
        nanoTitle: nano.title,
        title: nano.title
      }
    }),

    // Update stats
    refreshSubtaskNanoStats(subtaskId),
    refreshCardHierarchyStats(subtask.task),

    // Emit socket event
    Promise.resolve().then(() => {
        emitToBoard(subtask.board.toString(), 'hierarchy-nano-changed', {
            type: 'created',
            subtaskId,
            nano: populated
        });
    })
  ]);

  res.status(201).json({
    success: true,
    data: populated
  });
});

export const updateNano = asyncHandler(async (req, res, next) => {
  let nano = await SubtaskNano.findById(req.params.id);
  if (!nano) {
    return next(new ErrorResponse('Subtask-Nano not found', 404));
  }

  const oldNano = { ...nano.toObject() };
  const boardId = nano.board;
  const taskId = nano.task;
  const subtaskId = nano.subtask;

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
        nano.estimationTime,
        currentUser,
        'estimation'
      );
      processedEstimationTime = result.entries;
      if (result.errors.length > 0) {
        timeEntryWarnings.push(...result.errors);
      }
    } else {
      processedEstimationTime = nano.estimationTime;
    }
    
    if (req.body.loggedTime !== undefined) {
      const result = processTimeEntriesWithOwnership(
        req.body.loggedTime,
        nano.loggedTime,
        currentUser,
        'logged'
      );
      processedLoggedTime = result.entries;
      if (result.errors.length > 0) {
        timeEntryWarnings.push(...result.errors);
      }
    } else {
      processedLoggedTime = nano.loggedTime;
    }
    
    if (req.body.billedTime !== undefined) {
      const result = processTimeEntriesWithOwnership(
        req.body.billedTime,
        nano.billedTime,
        currentUser,
        'billed'
      );
      processedBilledTime = result.entries;
      if (result.errors.length > 0) {
        timeEntryWarnings.push(...result.errors);
      }
    } else {
      processedBilledTime = nano.billedTime;
    }
  } catch (validationError) {
    return res.status(400).json({
      success: false,
      error: validationError.message
    });
  }

  const updates = {
    title: req.body.title ?? nano.title,
    description: req.body.description ?? nano.description,
    status: req.body.status ?? nano.status,
    priority: req.body.priority ?? nano.priority,
    assignees: req.body.assignees ?? nano.assignees,
    dueDate: req.body.dueDate ?? nano.dueDate,
    startDate: req.body.startDate ?? nano.startDate,
    tags: req.body.tags ?? nano.tags,
    attachments: req.body.attachments ?? nano.attachments,
    colorToken: req.body.colorToken ?? nano.colorToken,
    estimationTime: processedEstimationTime,
    loggedTime: processedLoggedTime,
    billedTime: processedBilledTime,
    updatedBy: req.user.id
  };

  if (req.body.order !== undefined) {
    updates.order = req.body.order;
  }

  nano = await SubtaskNano.findByIdAndUpdate(
    req.params.id,
    updates,
    { new: true }
  ).populate(populateConfig);

  // Send response immediately for better UX
  res.status(200).json({
    success: true,
    data: nano
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
        subtask: subtaskId,
        nanoSubtask: nano._id,
        contextType: 'nanoSubtask'
      };

      if (oldNano.title !== nano.title) {
        activities.push({
          ...baseActivity,
          type: 'title_changed',
          description: `Changed title from "${oldNano.title}" to "${nano.title}"`
        });
      }
      if (oldNano.status !== nano.status) {
        activities.push({
          ...baseActivity,
          type: 'status_changed',
          description: `Changed status from ${oldNano.status} to ${nano.status}`
        });
      }
      if (oldNano.priority !== nano.priority) {
        activities.push({
          ...baseActivity,
          type: 'priority_changed',
          description: `Changed priority from ${oldNano.priority} to ${nano.priority}`
        });
      }
      if (oldNano.description !== nano.description) {
        activities.push({
          ...baseActivity,
          type: 'description_changed',
          description: 'Updated the description'
        });
      }
      if (oldNano.dueDate?.toString() !== nano.dueDate?.toString()) {
        activities.push({
          ...baseActivity,
          type: 'due_date_changed',
          description: `Changed due date to ${nano.dueDate}`
        });
      }
      if (JSON.stringify(oldNano.assignees) !== JSON.stringify(nano.assignees)) {
        activities.push({
          ...baseActivity,
          type: 'member_added',
          description: 'Updated assignees'
        });
      }
      if (JSON.stringify(oldNano.loggedTime) !== JSON.stringify(nano.loggedTime)) {
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

    // Refresh stats in parallel
    () => Promise.all([
      refreshSubtaskNanoStats(subtaskId),
      refreshCardHierarchyStats(taskId)
    ]),

    // Emit socket event
    () => emitToBoard(boardId.toString(), 'hierarchy-nano-changed', {
      type: 'updated',
      subtaskId: subtaskId.toString(),
      nano
    }),

    // Emit finance data refresh for time tracking changes
    () => {
      if (req.body.loggedTime !== undefined || req.body.billedTime !== undefined) {
        emitFinanceDataRefresh({
          changeType: req.body.billedTime !== undefined ? 'billed_time' : 'logged_time',
          nanoId: nano._id.toString(),
          subtaskId: subtaskId.toString(),
          cardId: taskId.toString(),
          boardId: boardId.toString()
        });
      }
    }
  ]);
});

export const deleteNano = asyncHandler(async (req, res, next) => {
  const nano = await SubtaskNano.findById(req.params.id);
  if (!nano) {
    return next(new ErrorResponse('Subtask-Nano not found', 404));
  }

  const nanoTitle = nano.title;
  const subtaskId = nano.subtask;
  const taskId = nano.task;
  const boardId = nano.board;

  await nano.deleteOne();

  // Log activity
  await Activity.create({
    type: 'nano_deleted',
    description: `Deleted nano-subtask "${nanoTitle}"`,
    user: req.user.id,
    board: boardId,
    card: taskId,
    subtask: subtaskId,
    nanoSubtask: nano._id,
    contextType: 'nanoSubtask',
    metadata: {
      nanoTitle
    }
  });

  await refreshSubtaskNanoStats(subtaskId);
  await refreshCardHierarchyStats(taskId);

  emitToBoard(boardId.toString(), 'hierarchy-nano-changed', {
    type: 'deleted',
    subtaskId: subtaskId.toString(),
    nanoId: nano._id
  });

  res.status(200).json({
    success: true,
    message: 'Subtask-Nano deleted'
  });
});

export const reorderNanos = asyncHandler(async (req, res, next) => {
  const { subtaskId } = req.params;
  const { orderedIds } = req.body;

  if (!Array.isArray(orderedIds)) {
    return next(new ErrorResponse('orderedIds array is required', 400));
  }

  const updates = orderedIds.map((nanoId, idx) =>
    SubtaskNano.findByIdAndUpdate(nanoId, { order: idx })
  );
  await Promise.all(updates);

  const nanos = await getOrderedNanos(subtaskId);
  const subtask = await Subtask.findById(subtaskId);

  emitToBoard(subtask.board.toString(), 'hierarchy-nano-changed', {
    type: 'reordered',
    subtaskId,
    nanos
  });

  res.status(200).json({
    success: true,
    data: nanos
  });
});

// @desc    Get nano-subtask activity logs
// @route   GET /api/subtask-nanos/:id/activity
// @access  Private
export const getNanoActivity = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { limit = 100, page = 1 } = req.query;

  // Verify nano-subtask exists
  const nano = await SubtaskNano.findById(id);
  if (!nano) {
    return next(new ErrorResponse('Subtask-Nano not found', 404));
  }

  // Get all activities for this nano-subtask - filter by both nanoSubtask reference and contextType
  const activities = await Activity.find({ 
    nanoSubtask: id,
    contextType: 'nanoSubtask'
  })
    .populate('user', 'name email avatar')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit));

  const total = await Activity.countDocuments({ 
    nanoSubtask: id,
    contextType: 'nanoSubtask'
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
// @route   POST /api/subtask-nanos/:id/time-tracking
// @access  Private
export const addTimeEntry = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { type, entry } = req.body;

  if (!['estimation', 'logged', 'billed'].includes(type)) {
    return next(new ErrorResponse('Invalid time entry type', 400));
  }

  const nano = await SubtaskNano.findById(id);
  if (!nano) {
    return next(new ErrorResponse('Subtask-Nano not found', 404));
  }

  const fieldName = `${type}Time`;
  
  const newEntry = {
    ...entry,
    user: req.user.id,
    _id: new mongoose.Types.ObjectId()
  };

  if (newEntry.hours) newEntry.hours = parseInt(newEntry.hours) || 0;
  if (newEntry.minutes) newEntry.minutes = parseInt(newEntry.minutes) || 0;

  nano[fieldName].push(newEntry);
  await nano.save();

  await nano.populate(`${fieldName}.user`, 'name email avatar');
  const addedEntry = nano[fieldName].find(e => e._id.toString() === newEntry._id.toString());
  
  await Activity.create({
    type: 'time_logged',
    description: `Added ${type} time entry (${newEntry.hours}h ${newEntry.minutes}m)`,
    user: req.user.id,
    board: nano.board,
    card: nano.task,
    subtask: nano.subtask,
    nanoSubtask: nano._id,
    contextType: 'nanoSubtask',
    metadata: {
        timeType: type,
        hours: newEntry.hours,
        minutes: newEntry.minutes
    }
  });

  const fullNano = await SubtaskNano.findById(id).populate(populateConfig);
  
  await Promise.all([
    refreshSubtaskNanoStats(nano.subtask),
    refreshCardHierarchyStats(nano.task)
  ]);

  emitToBoard(nano.board.toString(), 'hierarchy-nano-changed', {
    type: 'updated',
    subtaskId: nano.subtask.toString(),
    nano: fullNano
  });

  if (type === 'logged' || type === 'billed') {
    emitFinanceDataRefresh({
      changeType: type === 'billed' ? 'billed_time' : 'logged_time',
      nanoId: nano._id.toString(),
      subtaskId: nano.subtask.toString(),
      cardId: nano.task.toString(),
      boardId: nano.board.toString()
    });
  }

  res.status(200).json({
    success: true,
    data: addedEntry
  });
});

// @desc    Update time tracking entry
// @route   PUT /api/subtask-nanos/:id/time-tracking/:entryId
// @access  Private
export const updateTimeEntry = asyncHandler(async (req, res, next) => {
  const { id, entryId } = req.params;
  const { type, updates } = req.body;

  if (!['estimation', 'logged', 'billed'].includes(type)) {
    return next(new ErrorResponse('Invalid time entry type', 400));
  }

  const nano = await SubtaskNano.findById(id);
  if (!nano) {
    return next(new ErrorResponse('Subtask-Nano not found', 404));
  }

  const fieldName = `${type}Time`;
  const entryIndex = nano[fieldName].findIndex(e => e._id.toString() === entryId);

  if (entryIndex === -1) {
    return next(new ErrorResponse('Time entry not found', 404));
  }

  const entry = nano[fieldName][entryIndex];

  if (entry.user.toString() !== req.user.id.toString()) {
     return next(new ErrorResponse('Not authorized to update this time entry', 403));
  }

  if (updates.hours !== undefined) entry.hours = parseInt(updates.hours) || 0;
  if (updates.minutes !== undefined) entry.minutes = parseInt(updates.minutes) || 0;
  if (updates.date !== undefined) entry.date = updates.date;
  if (updates.reason !== undefined && type === 'estimation') entry.reason = updates.reason;
  if (updates.description !== undefined && type !== 'estimation') entry.description = updates.description;

  await nano.save();
  await nano.populate(`${fieldName}.user`, 'name email avatar');
  const updatedEntry = nano[fieldName][entryIndex];

  await Activity.create({
    type: 'time_logged',
    description: `Updated ${type} time entry`,
    user: req.user.id,
    board: nano.board,
    card: nano.task,
    subtask: nano.subtask,
    nanoSubtask: nano._id,
    contextType: 'nanoSubtask'
  });

  const fullNano = await SubtaskNano.findById(id).populate(populateConfig);

  await Promise.all([
    refreshSubtaskNanoStats(nano.subtask),
    refreshCardHierarchyStats(nano.task)
  ]);

  emitToBoard(nano.board.toString(), 'hierarchy-nano-changed', {
    type: 'updated',
    subtaskId: nano.subtask.toString(),
    nano: fullNano
  });
  
  if (type === 'logged' || type === 'billed') {
    emitFinanceDataRefresh({
      changeType: type === 'billed' ? 'billed_time' : 'logged_time',
      nanoId: nano._id.toString(),
      subtaskId: nano.subtask.toString(),
      cardId: nano.task.toString(),
      boardId: nano.board.toString()
    });
  }

  res.status(200).json({
    success: true,
    data: updatedEntry
  });
});

// @desc    Delete time tracking entry
// @route   DELETE /api/subtask-nanos/:id/time-tracking/:entryId
// @access  Private
export const deleteTimeEntry = asyncHandler(async (req, res, next) => {
  const { id, entryId } = req.params;
  const { type } = req.query;

  if (!['estimation', 'logged', 'billed'].includes(type)) {
    return next(new ErrorResponse('Invalid time entry type', 400));
  }

  const nano = await SubtaskNano.findById(id);
  if (!nano) {
    return next(new ErrorResponse('Subtask-Nano not found', 404));
  }

  const fieldName = `${type}Time`;
  const entryIndex = nano[fieldName].findIndex(e => e._id.toString() === entryId);

  if (entryIndex === -1) {
    return next(new ErrorResponse('Time entry not found', 404));
  }

  const entry = nano[fieldName][entryIndex];

  if (entry.user.toString() !== req.user.id.toString()) {
     return next(new ErrorResponse('Not authorized to delete this time entry', 403));
  }

  nano[fieldName].splice(entryIndex, 1);
  await nano.save();

  await Activity.create({
    type: 'time_logged',
    description: `Deleted ${type} time entry`,
    user: req.user.id,
    board: nano.board,
    card: nano.task,
    subtask: nano.subtask,
    nanoSubtask: nano._id,
    contextType: 'nanoSubtask'
  });

  const fullNano = await SubtaskNano.findById(id).populate(populateConfig);

  await Promise.all([
    refreshSubtaskNanoStats(nano.subtask),
    refreshCardHierarchyStats(nano.task)
  ]);

  emitToBoard(nano.board.toString(), 'hierarchy-nano-changed', {
    type: 'updated',
    subtaskId: nano.subtask.toString(),
    nano: fullNano
  });

  if (type === 'logged' || type === 'billed') {
    emitFinanceDataRefresh({
      changeType: type === 'billed' ? 'billed_time' : 'logged_time',
      nanoId: nano._id.toString(),
      subtaskId: nano.subtask.toString(),
      cardId: nano.task.toString(),
      boardId: nano.board.toString()
    });
  }

  res.status(200).json({
    success: true,
    data: { _id: entryId }
  });
});


